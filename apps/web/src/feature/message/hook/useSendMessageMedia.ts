import type { MessageDto, RequestMessageUploadUrlInput, SendMessageInput } from "@cmv/shared";
import { MessageType } from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { messageKeys, requestMessageUploadUrl, sendMessage } from "@/feature/message/api";
import type { RecordedWebAudio } from "@/feature/message/hook/useWebAudioRecorder";
import {
  MediaRejectedError,
  type PreparedWebMedia,
  prepareAudioBlob,
  prepareImageFile,
  prepareVideoFile,
} from "@/feature/message/util/media.util";
import { useToast } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { uploadToSignedUrl } from "@/shared/lib/upload";

// Source avant préparation : un fichier joint (image/vidéo) ou une note vocale enregistrée.
type MediaSource = { kind: "file"; file: File } | { kind: "audio"; audio: RecordedWebAudio };

/**
 * Envoi d'un média depuis le web : préparation (validation, durée) → URL signée → upload direct
 * (avec progression) → message. Le binaire ne passe jamais par l'API. Un refus métier porte sa clé
 * i18n ; une panne technique garde le message de l'API — les deux passent par un toast.
 */
export function useSendMessageMedia(conversationId: string) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);

  const send = useMutation({
    mutationFn: async (source: MediaSource) => {
      const prepared = await prepare(source);
      setProgress(0);
      return uploadAndSend(conversationId, prepared, setProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations() });
    },
    onError: (error) => {
      toast.error(
        error instanceof MediaRejectedError
          ? t(error.reasonKey)
          : (apiErrorMessage(error) ?? t("common.error")),
      );
    },
  });

  return {
    sendFile: (file: File) => send.mutate({ kind: "file", file }),
    sendAudio: (audio: RecordedWebAudio) => send.mutate({ kind: "audio", audio }),
    isUploading: send.isPending,
    progress,
  };
}

function prepare(source: MediaSource): Promise<PreparedWebMedia> | PreparedWebMedia {
  if (source.kind === "audio") {
    return prepareAudioBlob(source.audio.blob, source.audio.durationSeconds);
  }
  if (source.file.type.startsWith("image/")) return prepareImageFile(source.file);
  if (source.file.type.startsWith("video/")) return prepareVideoFile(source.file);
  throw new MediaRejectedError("messages.media.unsupported");
}

async function uploadAndSend(
  conversationId: string,
  media: PreparedWebMedia,
  onProgress: (percent: number) => void,
): Promise<MessageDto> {
  const uploadInput = toUploadUrlInput(media);
  const signed = await requestMessageUploadUrl(conversationId, uploadInput);
  await uploadToSignedUrl(signed.uploadUrl, media.file, onProgress);
  const sendInput = { ...uploadInput, storagePath: signed.storagePath } as SendMessageInput;
  return sendMessage(conversationId, sendInput);
}

// Descripteur commun à la demande d'URL et à l'envoi : une source, pas de dérive de taille.
function toUploadUrlInput(media: PreparedWebMedia): RequestMessageUploadUrlInput {
  if (media.type === MessageType.IMAGE) {
    return {
      type: media.type,
      fileName: media.fileName,
      mimeType: media.mimeType,
      size: media.size,
    };
  }
  // AUDIO et VIDEO portent `durationSeconds` ; le cast couvre l'union que TS ne narrow pas quand
  // `type` et `mimeType` restent ouverts.
  return {
    type: media.type,
    fileName: media.fileName,
    mimeType: media.mimeType,
    size: media.size,
    durationSeconds: media.durationSeconds,
  } as RequestMessageUploadUrlInput;
}
