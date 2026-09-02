import type {
  CapabilityName,
  MediaBatchStep,
  MediaRecapReason,
  MediaRejection,
  MessageDto,
  MultipartUploadTicket,
  RequestMessageUploadUrlInput,
  SendMessageInput,
} from "@cmv/shared";
import {
  MAX_MESSAGE_MEDIA_BATCH,
  MediaType,
  MessageType,
  mediaRecapText,
  sendMediaBatch,
  UploadMode,
} from "@cmv/shared";
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
  attachableMediaKind,
  MediaRejectedError,
  type PreparedWebMedia,
  prepareWebMedia,
  type WebMediaSource,
} from "@/shared/util/media.util";

/**
 * Envoi de médias depuis le web : préparation (validation, durée) → URL signée → upload direct
 * (avec progression) → message. Le binaire ne passe jamais par l'API.
 *
 * Plusieurs fichiers partent d'un seul geste (#156), un par un. La FILE n'est pas ici :
 * `sendMediaBatch` (@cmv/shared) la tient pour les quatre surfaces — ce hook n'apporte que le
 * transport, l'invalidation du fil, et les libellés propres à la messagerie.
 */
export function useSendMessageMedia(
  conversationId: string,
  /**
   * Ce sur quoi les médias envoyés portent, et ce qu'il faut rafraîchir en plus du fil.
   *
   * Les deux vont ensemble : répondre en photo depuis un débrief doit rattacher le message ET
   * faire apparaître la photo là où on l'a envoyée. Invalider le seul fil laisserait le volet de
   * lecture afficher l'état d'avant l'envoi.
   */
  options?: { attachment: { sessionFeedbackId: string } | undefined; onSent?: () => void },
) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<MediaBatchStep | null>(null);
  const as = useExercisedCapability();

  const attachment = options?.attachment;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId, as) });
    queryClient.invalidateQueries({ queryKey: messageKeys.conversations(as) });
    options?.onSent?.();
  };

  const audio = useMutation({
    mutationFn: (recorded: RecordedWebAudio) => {
      setProgress(0);
      return prepareAndSend(
        conversationId,
        { kind: "audio", blob: recorded.blob, durationSeconds: recorded.durationSeconds },
        setProgress,
        as,
        attachment,
      );
    },
    onSuccess: invalidate,
    onError: (error) => toast.error(mediaRecapText(failureReason(error), t)),
  });

  /**
   * Le fil est invalidé à CHAQUE fichier plutôt qu'à la fin : les messages apparaissent au fur et
   * à mesure, comme si on les avait envoyés un par un — ce que l'expéditeur a fait, du reste.
   */
  const upload = async (file: File, current: MediaBatchStep) => {
    setStep(current);
    setProgress(0);
    await prepareAndSend(conversationId, { kind: "file", file }, setProgress, as, attachment);
    invalidate();
  };

  /**
   * Un toast PAR fichier écarté, et non un compte rendu fondu en une ligne : « 2 fichiers sur 5
   * n'ont pas pu être envoyés » ne dit pas lesquels, ce qui laisse à refaire la sélection entière.
   * La pile de toasts existe précisément pour ça.
   */
  const sendFiles = async (files: readonly File[]) => {
    const recap = await sendMediaBatch({
      items: files,
      maxItems: MAX_MESSAGE_MEDIA_BATCH,
      // Le fil n'a aucun quota : sa seule borne est celle du lot, la même pour les trois familles.
      remaining: {
        [MediaType.IMAGE]: MAX_MESSAGE_MEDIA_BATCH,
        [MediaType.VIDEO]: MAX_MESSAGE_MEDIA_BATCH,
        [MediaType.AUDIO]: MAX_MESSAGE_MEDIA_BATCH,
      },
      kindOf: attachableMediaKind,
      nameOf: (file) => file.name,
      send: upload,
      rejectedReason,
      failureReason,
    }).finally(() => setStep(null));

    for (const entry of recap) {
      toast.error(
        `${entry.fileName ?? t("messages.media.unnamedFile")} — ${mediaRecapText(entry.reason, t)}`,
      );
    }
  };

  return {
    sendFiles: (files: readonly File[]) => {
      void sendFiles(files);
    },
    sendAudio: (recorded: RecordedWebAudio) => audio.mutate(recorded),
    isUploading: step != null || audio.isPending,
    step,
    progress,
  };
}

/**
 * Ce que dit un refus qui précède l'envoi. `noSlot` ne peut pas survenir — le fil n'a pas de quota,
 * et ses places valent le plafond du lot — donc tout ce qui n'est pas un type refusé est un lot
 * trop grand.
 */
function rejectedReason({ cause }: MediaRejection): MediaRecapReason {
  if (cause === "unsupported") return { key: "messages.media.unsupported", params: {} };
  return { key: "messages.media.tooMany", params: { max: MAX_MESSAGE_MEDIA_BATCH } };
}

/** Un refus métier porte sa clé i18n ; une panne technique garde le message de l'API. */
function failureReason(error: unknown): MediaRecapReason {
  if (error instanceof MediaRejectedError) return { key: error.reasonKey, params: error.params };
  const message = apiErrorMessage(error);
  return message == null ? { key: "common.error", params: {} } : { message };
}

async function prepareAndSend(
  conversationId: string,
  source: WebMediaSource,
  onProgress: (percent: number) => void,
  as: CapabilityName | null,
  attachment: { sessionFeedbackId: string } | undefined,
): Promise<MessageDto> {
  const prepared = await prepareWebMedia(source, MESSAGE_MEDIA_PROFILE);
  return uploadAndSend(conversationId, prepared, onProgress, as, attachment);
}

async function uploadAndSend(
  conversationId: string,
  media: PreparedWebMedia,
  onProgress: (percent: number) => void,
  // Le titre traverse jusqu'ici : un upload est une écriture dans un fil, donc scopée comme lui.
  as: CapabilityName | null,
  attachment: { sessionFeedbackId: string } | undefined,
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

  const sendInput = {
    ...uploadInput,
    storagePath: ticket.storagePath,
    ...attachment,
  } as SendMessageInput;
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
