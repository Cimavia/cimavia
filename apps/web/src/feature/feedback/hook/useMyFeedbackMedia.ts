import type {
  AttachFeedbackMediaInput,
  MediaTypeType,
  RequestFeedbackUploadUrlInput,
} from "@cmv/shared";
import {
  maxFeedbackMediaSizeBytes,
  megabytesOf,
  myFeedbackKeys,
  myPlanKeys,
  UploadMode,
} from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { athleteFeedbackApi } from "@/feature/feedback/api";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import type { RecordedWebAudio } from "@/shared/hook/useWebAudioRecorder";
import { uploadToSignedUrl } from "@/shared/lib/upload";
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
  };
}

/**
 * Ajoute un média au débrief : préparation → URL signée → upload direct vers le bucket →
 * rattachement. Le binaire ne passe jamais par l'API (règle 7).
 *
 * La taille est revérifiée ICI, après préparation, parce que c'est la taille FINALE qui est signée
 * dans l'URL : le storage refuse tout autre poids. Laisser passer, c'est échouer à l'étape la plus
 * chère (celle qui a déjà transféré le fichier).
 */
export function useAddFeedbackMedia(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);
  const [progress, setProgress] = useState(0);

  const add = useMutation({
    mutationFn: async (source: WebMediaSource) => {
      const media = await prepareWebMedia(source, FEEDBACK_MEDIA_PROFILE);
      if (media.size > maxFeedbackMediaSizeBytes(media.type)) {
        throw new MediaRejectedError(tooBigKey(media.type), {
          max: megabytesOf(maxFeedbackMediaSizeBytes(media.type)),
        });
      }
      setProgress(0);
      return uploadAndAttach(sessionId, media, setProgress);
    },
    onSuccess: invalidate,
  });

  return {
    addFile: (file: File) => add.mutate({ kind: "file", file }),
    addAudio: (audio: RecordedWebAudio) =>
      add.mutate({ kind: "audio", blob: audio.blob, durationSeconds: audio.durationSeconds }),
    isUploading: add.isPending,
    error: add.error,
    progress,
  };
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

  const ticket = await athleteFeedbackApi.requestMediaUploadUrl(sessionId, descriptor);
  // TRANSITOIRE — l'envoi découpé arrive dans son propre commit. Jusque-là ce client ne sait
  // traiter que le mode SINGLE ; on échoue franchement plutôt que de lire un `uploadUrl` absent,
  // ce qui partirait en `PUT undefined`. Aucune régression : au-delà du seuil, le PUT unique se
  // faisait déjà refuser par le bord réseau, en 413 et sans explication.
  if (ticket.mode !== UploadMode.SINGLE) {
    throw new Error("Envoi découpé pas encore pris en charge par le web");
  }

  await uploadToSignedUrl(ticket.uploadUrl, media.file, onProgress);
  await athleteFeedbackApi.attachMedia(sessionId, {
    ...descriptor,
    storagePath: ticket.storagePath,
  } as AttachFeedbackMediaInput);
}
