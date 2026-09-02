import type {
  AttachFeedbackMediaInput,
  BatchOutcome,
  MediaTypeType,
  MultipartUploadTicket,
  RequestFeedbackUploadUrlInput,
} from "@cmv/shared";
import {
  coachFeedbackKeys,
  maxFeedbackMediaSizeBytes,
  megabytesOf,
  myFeedbackKeys,
  myPlanKeys,
  runSequentially,
  UploadMode,
} from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { athleteFeedbackApi } from "@/feature/feedback/api";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import type { RecordedWebAudio } from "@/shared/hook/useWebAudioRecorder";
import { uploadInParts, uploadToSignedUrl } from "@/shared/lib/upload";
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
    queryClient.invalidateQueries({ queryKey: myPlanKeys.current() });
    // Idem : en auto-coaching, l'auteur est aussi le lecteur (#14).
    queryClient.invalidateQueries({ queryKey: coachFeedbackKeys.all });
  };
}

/** Le fichier en cours dans un lot, pour dire lequel avance pendant que la file tourne. */
export type FeedbackUploadStep = { index: number; total: number; fileName: string };

/**
 * Ajoute des médias au débrief : préparation → URL signée → upload direct vers le bucket →
 * rattachement. Le binaire ne passe jamais par l'API (règle 7).
 *
 * Un lot part fichier par fichier, et un échec n'arrête pas les suivants (#156) : l'appelant lit
 * les issues rendues par `addFiles` et récapitule ce qui n'est pas passé. C'est la seule façon
 * honnête de rendre compte d'une sélection de cinq fichiers dont un seul a été refusé.
 */
export function useAddFeedbackMedia(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<FeedbackUploadStep | null>(null);

  const audio = useMutation({
    mutationFn: (recorded: RecordedWebAudio) => {
      setProgress(0);
      return prepareAndUpload(
        sessionId,
        { kind: "audio", blob: recorded.blob, durationSeconds: recorded.durationSeconds },
        setProgress,
      );
    },
    onSuccess: invalidate,
  });

  /**
   * Le lot. La progression est publiée AVANT d'attendre, pour que « Envoi 2 / 5 » désigne le
   * fichier qui part et non celui qui vient de partir.
   *
   * Le cache est invalidé à CHAQUE fichier plutôt qu'à la fin : la galerie se remplit au fur et à
   * mesure, ce qui vaut mieux qu'un écran figé pendant l'envoi de cinq vidéos — et si le lot casse
   * en route, ce qui est déjà passé est visible.
   */
  const addFiles = (files: readonly File[]): Promise<BatchOutcome<File>[]> =>
    runSequentially(files, async (file, index) => {
      setStep({ index: index + 1, total: files.length, fileName: file.name });
      setProgress(0);
      await prepareAndUpload(sessionId, { kind: "file", file }, setProgress);
      invalidate();
    }).finally(() => setStep(null));

  return {
    addFiles,
    addAudio: (recorded: RecordedWebAudio) => audio.mutate(recorded),
    /** L'échec de la NOTE VOCALE seule : les refus d'un lot de fichiers vivent dans ses issues. */
    audioError: audio.error,
    isUploading: step != null || audio.isPending,
    step,
    progress,
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
): Promise<void> {
  const media = await prepareWebMedia(source, FEEDBACK_MEDIA_PROFILE);
  if (media.size > maxFeedbackMediaSizeBytes(media.type)) {
    throw new MediaRejectedError(tooBigKey(media.type), {
      max: megabytesOf(maxFeedbackMediaSizeBytes(media.type)),
    });
  }
  await uploadAndAttach(sessionId, media, onProgress);
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
    await sendInParts(sessionId, ticket, media.file, onProgress);
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
 * Tout échec ABANDONNE l'upload. Les parts déjà montées d'un upload jamais clos restent facturées
 * SANS apparaître à l'inventaire du bucket : personne ne les retrouverait pour les purger à la
 * main. On paie donc un envoi à refaire depuis le début plutôt qu'une fuite invisible — le jour où
 * une reprise sera offerte, c'est ici qu'elle se branchera.
 */
async function sendInParts(
  sessionId: string,
  ticket: MultipartUploadTicket,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  const upload = { storagePath: ticket.storagePath, uploadId: ticket.uploadId };
  try {
    await uploadInParts(file, ticket.partUrls, ticket.partSize, onProgress);
    await athleteFeedbackApi.completeMediaUpload(sessionId, {
      ...upload,
      partCount: ticket.partUrls.length,
    });
  } catch (error) {
    // L'échec de l'abandon lui-même est avalé : il ne doit pas masquer l'erreur d'origine, la
    // seule que l'athlète peut comprendre et sur laquelle il peut agir.
    await athleteFeedbackApi.abortMediaUpload(sessionId, upload).catch(() => undefined);
    throw error;
  }
}
