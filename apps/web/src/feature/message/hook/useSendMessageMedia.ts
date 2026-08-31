import type {
  CapabilityName,
  MessageDto,
  MultipartUploadTicket,
  RequestMessageUploadUrlInput,
  SendMessageInput,
} from "@cmv/shared";
import { MessageType, UploadMode } from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { messageApi, messageKeys } from "@/feature/message/api";
import { MESSAGE_MEDIA_PROFILE } from "@/feature/message/constant";
import { useToast } from "@/shared/component";
import { useExercisedCapability } from "@/shared/hook/useCapabilities";
import type { RecordedWebAudio } from "@/shared/hook/useWebAudioRecorder";
import { apiErrorMessage } from "@/shared/lib/api";
import { uploadInParts, uploadToSignedUrl } from "@/shared/lib/upload";
import {
  MediaRejectedError,
  type PreparedWebMedia,
  prepareWebMedia,
  type WebMediaSource,
} from "@/shared/util/media.util";

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
  const as = useExercisedCapability();

  const send = useMutation({
    mutationFn: async (source: WebMediaSource) => {
      const prepared = await prepareWebMedia(source, MESSAGE_MEDIA_PROFILE);
      setProgress(0);
      return uploadAndSend(conversationId, prepared, setProgress, as);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId, as) });
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations(as) });
    },
    onError: (error) => {
      toast.error(
        error instanceof MediaRejectedError
          ? t(error.reasonKey, error.params)
          : (apiErrorMessage(error) ?? t("common.error")),
      );
    },
  });

  return {
    sendFile: (file: File) => send.mutate({ kind: "file", file }),
    sendAudio: (audio: RecordedWebAudio) =>
      send.mutate({ kind: "audio", blob: audio.blob, durationSeconds: audio.durationSeconds }),
    isUploading: send.isPending,
    progress,
  };
}

async function uploadAndSend(
  conversationId: string,
  media: PreparedWebMedia,
  onProgress: (percent: number) => void,
  // Le titre traverse jusqu'ici : un upload est une écriture dans un fil, donc scopée comme lui.
  as: CapabilityName | null,
): Promise<MessageDto> {
  const uploadInput = toUploadUrlInput(media);
  // C'est l'API qui décide de la forme de l'envoi, à partir de la seule taille : au-delà du seuil,
  // un PUT unique ne franchirait pas le bord réseau (cf. `upload.schema.ts`).
  const ticket = await messageApi.requestUploadUrl(conversationId, uploadInput, as);
  if (ticket.mode === UploadMode.SINGLE) {
    await uploadToSignedUrl(ticket.uploadUrl, media.file, onProgress);
  } else {
    await sendInParts(conversationId, ticket, media.file, onProgress, as);
  }

  const sendInput = { ...uploadInput, storagePath: ticket.storagePath } as SendMessageInput;
  return messageApi.sendMessage(conversationId, sendInput, as);
}

/**
 * Envoi découpé : les parts, puis la clôture qui les recolle. Tout échec ABANDONNE l'upload — les
 * parts d'un upload jamais clos restent facturées SANS apparaître à l'inventaire du bucket, donc
 * personne ne les retrouverait pour les purger. Jumeau de `sendInParts` du débrief ; à promouvoir
 * en util partagé si un 3ᵉ appelant apparaît (cf. #96).
 */
async function sendInParts(
  conversationId: string,
  ticket: MultipartUploadTicket,
  file: File,
  onProgress: (percent: number) => void,
  as: CapabilityName | null,
): Promise<void> {
  const upload = { storagePath: ticket.storagePath, uploadId: ticket.uploadId };
  try {
    await uploadInParts(file, ticket.partUrls, ticket.partSize, onProgress);
    await messageApi.completeMediaUpload(
      conversationId,
      { ...upload, partCount: ticket.partUrls.length },
      as,
    );
  } catch (error) {
    // L'échec de l'abandon est avalé : il ne doit pas masquer l'erreur d'origine, la seule sur
    // laquelle l'utilisateur peut agir.
    await messageApi.abortMediaUpload(conversationId, upload, as).catch(() => undefined);
    throw error;
  }
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
