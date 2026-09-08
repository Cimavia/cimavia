import type {
  AttachFeedbackMediaInput,
  MediaBatch,
  MediaBatchStep,
  MediaRecapLine,
  MediaTypeType,
  MultipartRetry,
  MultipartUploadTicket,
  RequestFeedbackUploadUrlInput,
} from "@cmv/shared";
import {
  coachFeedbackKeys,
  maxFeedbackMediaSizeBytes,
  megabytesOf,
  myFeedbackKeys,
  myPlanKeys,
  runMultipartUpload,
  sendMediaBatch,
  UploadMode,
} from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { athleteFeedbackApi } from "@/feature/feedback/api";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import type { RecordedWebAudio } from "@/shared/hook/useWebAudioRecorder";
import { sendWebPart, uploadToSignedUrl, webPartFailure } from "@/shared/lib/upload";
import {
  MediaRejectedError,
  type PreparedWebMedia,
  prepareWebMedia,
  type WebMediaSource,
} from "@/shared/util/media.util";

/**
 * Après un ajout ou un retrait de média, la séance a pu passer en `DONE` (le premier média suffit
 * à débriefer) : le planning et le détail doivent suivre, sinon ils afficheraient encore
 * « À faire ».
 */
function useInvalidateFeedback(sessionId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: myFeedbackKeys.detail(sessionId) });
    queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
    queryClient.invalidateQueries({ queryKey: myPlanKeys.visible() });
    // Idem : en auto-coaching, l'auteur est aussi le lecteur (#14).
    queryClient.invalidateQueries({ queryKey: coachFeedbackKeys.all });
  };
}

/**
 * Ajoute des médias au débrief : préparation → URL signée → upload direct vers le bucket →
 * rattachement. Le binaire ne passe jamais par l'API (règle 7).
 *
 * La FILE elle-même n'est pas ici : `sendMediaBatch` (@cmv/shared) tient le tri, l'ordre et le
 * récapitulatif pour les quatre surfaces. Ce hook n'apporte que ce qui est propre au débrief web —
 * le transport, l'invalidation du cache, et l'état affiché pendant l'envoi.
 */
export function useAddFeedbackMedia(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<MediaBatchStep | null>(null);
  // Ce que la barre dit quand elle n'avance plus : sans ça, trois minutes de silence.
  const [retry, setRetry] = useState<MultipartRetry | null>(null);

  const audio = useMutation({
    mutationFn: (recorded: RecordedWebAudio) => {
      setProgress(0);
      setRetry(null);
      return prepareAndUpload(
        sessionId,
        { kind: "audio", blob: recorded.blob, durationSeconds: recorded.durationSeconds },
        setProgress,
        setRetry,
      );
    },
    onSuccess: invalidate,
  });

  /**
   * Le cache est invalidé à CHAQUE fichier plutôt qu'à la fin : la galerie se remplit au fur et à
   * mesure, ce qui vaut mieux qu'un écran figé pendant l'envoi de cinq vidéos — et si le lot casse
   * en route, ce qui est déjà passé reste visible.
   */
  const upload = async (file: File, current: MediaBatchStep) => {
    setStep(current);
    setProgress(0);
    setRetry(null);
    await prepareAndUpload(sessionId, { kind: "file", file }, setProgress, setRetry);
    invalidate();
  };

  // L'appelant décide de la POLITIQUE du lot (places restantes, plafond, libellés des refus) ;
  // le hook n'impose que l'envoi.
  const addFiles = (batch: Omit<MediaBatch<File>, "send">): Promise<MediaRecapLine[]> =>
    sendMediaBatch({ ...batch, send: upload }).finally(() => {
      setStep(null);
      setRetry(null);
    });

  return {
    addFiles,
    addAudio: (recorded: RecordedWebAudio) => audio.mutate(recorded),
    /** L'échec de la NOTE VOCALE seule : les refus d'un lot de fichiers vivent dans son récap. */
    audioError: audio.error,
    isUploading: step != null || audio.isPending,
    step,
    progress,
    retry,
  };
}

/**
 * La taille est revérifiée ICI, après préparation, parce que c'est la taille FINALE qui est signée
 * dans l'URL : le storage refuse tout autre poids. Laisser passer, c'est échouer à l'étape la plus
 * chère (celle qui a déjà transféré le fichier).
 */
async function prepareAndUpload(
  sessionId: string,
  source: WebMediaSource,
  onProgress: (percent: number) => void,
  onRetry: (retry: MultipartRetry | null) => void,
): Promise<void> {
  const media = await prepareWebMedia(source, FEEDBACK_MEDIA_PROFILE);
  if (media.size > maxFeedbackMediaSizeBytes(media.type)) {
    throw new MediaRejectedError(tooBigKey(media.type), {
      max: megabytesOf(maxFeedbackMediaSizeBytes(media.type)),
    });
  }
  await uploadAndAttach(sessionId, media, onProgress, onRetry);
}

export function useDeleteFeedbackMedia(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);

  return useMutation({
    mutationFn: (mediaId: string) => athleteFeedbackApi.deleteMedia(sessionId, mediaId),
    onSuccess: invalidate,
  });
}

function tooBigKey(type: MediaTypeType): string {
  const keys = FEEDBACK_MEDIA_PROFILE.keys;
  if (type === "VIDEO") return keys.videoTooBig;
  if (type === "AUDIO") return keys.audioTooBig;
  return keys.imageTooBig;
}

async function uploadAndAttach(
  sessionId: string,
  media: PreparedWebMedia,
  onProgress: (percent: number) => void,
  onRetry: (retry: MultipartRetry | null) => void,
): Promise<void> {
  const descriptor = {
    type: media.type,
    fileName: media.fileName,
    mimeType: media.mimeType,
    size: media.size,
    // AUDIO et VIDEO portent `durationSeconds` ; le cast couvre l'union que TS ne narrow pas
    // quand `type` et `mimeType` restent ouverts (même geste que côté messagerie).
    ...("durationSeconds" in media ? { durationSeconds: media.durationSeconds } : {}),
  } as RequestFeedbackUploadUrlInput;

  // C'est l'API qui décide de la forme de l'envoi, à partir de la seule taille : au-delà du seuil,
  // un PUT unique ne franchirait pas le bord réseau (cf. `upload.schema.ts`).
  const ticket = await athleteFeedbackApi.requestMediaUploadUrl(sessionId, descriptor);
  if (ticket.mode === UploadMode.SINGLE) {
    await uploadToSignedUrl(ticket.uploadUrl, media.file, onProgress);
  } else {
    await sendInParts(sessionId, ticket, media.file, onProgress, onRetry);
  }

  await athleteFeedbackApi.attachMedia(sessionId, {
    ...descriptor,
    storagePath: ticket.storagePath,
  } as AttachFeedbackMediaInput);
}

/**
 * Envoi découpé : les parts, puis la clôture qui les recolle en un objet. Tant qu'elle n'a pas eu
 * lieu, rien n'existe dans le bucket — le rattachement porterait sur un chemin vide.
 *
 * La boucle, le réessai et l'abandon vivent dans `runMultipartUpload` (`@cmv/shared`) : ce qui
 * était écrit quatre fois — débrief et messagerie, web et mobile — l'est désormais une seule.
 * Il ne reste ici que ce qui appartient au débrief : quelle séance clore, et quel fichier découper.
 *
 * `file.size` et non la taille DÉCLARÉE : c'est le fichier réel qu'on découpe, et le confronter au
 * ticket signale un écart avant d'avoir poussé le moindre octet, là où le storage ne le dirait
 * qu'en refusant chaque part sur son `ContentLength`.
 */
function sendInParts(
  sessionId: string,
  ticket: MultipartUploadTicket,
  file: File,
  onProgress: (percent: number) => void,
  onRetry: (retry: MultipartRetry | null) => void,
): Promise<void> {
  const upload = { storagePath: ticket.storagePath, uploadId: ticket.uploadId };
  return runMultipartUpload(ticket, file.size, {
    sendPart: (part, onSentBytes) => sendWebPart(file, part, onSentBytes),
    failureOf: webPartFailure,
    complete: (partCount) =>
      athleteFeedbackApi.completeMediaUpload(sessionId, { ...upload, partCount }),
    abort: () => athleteFeedbackApi.abortMediaUpload(sessionId, upload),
    onProgress,
    onRetry,
  });
}
