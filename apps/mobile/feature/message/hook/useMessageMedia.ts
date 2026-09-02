import type {
  CapabilityName,
  MediaBatchStep,
  MediaRecapLine,
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
  sendMediaBatch,
  UploadMode,
} from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { messageApi, messageKeys } from "@/feature/message/api";
import {
  MediaRejectedError,
  type PreparedMessageMedia,
  prepareAsset,
  prepareAudio,
} from "@/feature/message/util/media.util";
import type { RecordedAudio } from "@/shared/component";
import { useExercisedCapability } from "@/shared/hook/useExercisedCapability";
import { StorageUploadError, uploadFileToStorage, uploadPartsToStorage } from "@/shared/lib/upload";
import { assetMediaKind } from "@/shared/util/media-kind.util";

/**
 * Envoi de médias dans un fil : préparation (compression/mesure) → URL signée → upload direct →
 * message. Le binaire ne passe jamais par l'API.
 *
 * Plusieurs médias partent d'un seul geste (#156), un par un. La FILE n'est pas ici :
 * `sendMediaBatch` (@cmv/shared) la tient pour les quatre surfaces — ce hook n'apporte que le
 * transport, l'invalidation du fil, et les libellés propres à la messagerie.
 *
 * L'ouverture de la galerie se fait HORS de tout envoi : sinon l'indicateur « envoi en cours »
 * s'allumerait pendant que l'utilisateur choisit encore.
 */
export function useSendMessageMedia(
  conversationId: string,
  /**
   * Ce sur quoi les médias envoyés portent, et ce qu'il faut rafraîchir en plus du fil.
   *
   * Les deux vont ensemble : répondre en vocal depuis un débrief doit rattacher le message ET
   * faire apparaître la note là où on l'a enregistrée. Invalider le seul fil laisserait l'écran
   * du débrief afficher l'état d'avant l'envoi.
   */
  options?: { attachment?: { sessionFeedbackId: string }; onSent?: () => void },
) {
  const queryClient = useQueryClient();
  const as = useExercisedCapability();
  const [step, setStep] = useState<MediaBatchStep | null>(null);

  const attachment = options?.attachment;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId, as) });
    queryClient.invalidateQueries({ queryKey: messageKeys.myConversation() });
    options?.onSent?.();
  };

  const audio = useMutation({
    mutationFn: (recorded: RecordedAudio) =>
      uploadAndSend(conversationId, prepareAudio(recorded), as, attachment),
    onSuccess: invalidate,
  });

  /**
   * Le fil est invalidé à CHAQUE média plutôt qu'à la fin : les messages apparaissent au fur et à
   * mesure, comme si on les avait envoyés un par un — ce que l'expéditeur a fait, du reste.
   */
  const upload = async (asset: ImagePicker.ImagePickerAsset, current: MediaBatchStep) => {
    setStep(current);
    await uploadAndSend(conversationId, await prepareAsset(asset), as, attachment);
    invalidate();
  };

  /**
   * Ouvre la galerie puis envoie le lot. L'échec de SÉLECTION (permission) est signalé à part : il
   * précède tout envoi, et n'a donc pas de ligne de récapitulatif où vivre.
   */
  const pickAndSend = async (
    onPickError: (reasonKey: string) => void,
  ): Promise<MediaRecapLine[]> => {
    let picked: ImagePicker.ImagePickerAsset[];
    try {
      picked = await pickImagesOrVideos();
    } catch (error) {
      onPickError(
        error instanceof MediaRejectedError ? error.reasonKey : "messages.media.uploadError",
      );
      return [];
    }
    if (picked.length === 0) return []; // sélection annulée : ce n'est pas une erreur

    return sendMediaBatch({
      items: picked,
      maxItems: MAX_MESSAGE_MEDIA_BATCH,
      // Le fil n'a aucun quota : sa seule borne est celle du lot, la même pour les trois familles.
      remaining: {
        [MediaType.IMAGE]: MAX_MESSAGE_MEDIA_BATCH,
        [MediaType.VIDEO]: MAX_MESSAGE_MEDIA_BATCH,
        [MediaType.AUDIO]: MAX_MESSAGE_MEDIA_BATCH,
      },
      kindOf: assetMediaKind,
      nameOf: (asset) => asset.fileName ?? null,
      send: upload,
      rejectedReason,
      failureReason,
    }).finally(() => setStep(null));
  };

  const recordAndSend = (recorded: RecordedAudio) => audio.mutate(recorded);

  return {
    pickAndSend,
    recordAndSend,
    isUploading: step != null || audio.isPending,
    step,
    /** L'échec de la NOTE VOCALE seule : les refus d'un lot vivent dans son récapitulatif. */
    audioError: audio.error,
  };
}

/**
 * Ce que dit un refus qui précède l'envoi. `noSlot` ne peut pas survenir — le fil n'a pas de quota,
 * et ses places valent le plafond du lot ; `unsupported` non plus — la galerie ne rend que des
 * images et des vidéos. Tout ce qui reste est un lot trop grand.
 */
function rejectedReason(_rejection: MediaRejection): MediaRecapReason {
  return { key: "messages.media.tooMany", params: { max: MAX_MESSAGE_MEDIA_BATCH } };
}

/** Un refus métier porte sa clé i18n ; une panne technique garde le message de l'API. */
function failureReason(error: unknown): MediaRecapReason {
  if (error instanceof MediaRejectedError) return { key: error.reasonKey, params: error.params };
  return { key: "messages.media.uploadError", params: {} };
}

async function uploadAndSend(
  conversationId: string,
  media: PreparedMessageMedia,
  // Le titre traverse jusqu'ici : un upload est une écriture dans un fil, donc scopée comme lui.
  as: CapabilityName | null,
  attachment: { sessionFeedbackId: string } | undefined,
): Promise<MessageDto> {
  const uploadInput = toUploadUrlInput(media);
  // C'est l'API qui décide de la forme de l'envoi, à partir de la seule taille : au-delà du seuil,
  // un PUT unique ne franchirait pas le bord réseau (cf. `upload.schema.ts`).
  const ticket = await messageApi.requestUploadUrl(conversationId, uploadInput, as);
  try {
    if (ticket.mode === UploadMode.SINGLE) {
      await uploadFileToStorage(ticket.uploadUrl, media.uri, media.mimeType);
    } else {
      await sendInParts(conversationId, ticket, media, as);
    }
  } catch (error) {
    throw toMessageMediaError(error);
  }

  // Le message média = le même descripteur + la clé objet rendue par le ticket. Le cast couvre
  // la fusion de l'union discriminée, que TS ne sait pas prouver.
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
 * personne ne les retrouverait pour les purger.
 */
async function sendInParts(
  conversationId: string,
  ticket: MultipartUploadTicket,
  media: PreparedMessageMedia,
  as: CapabilityName | null,
): Promise<void> {
  const upload = { storagePath: ticket.storagePath, uploadId: ticket.uploadId };
  try {
    await uploadPartsToStorage(media.uri, ticket.partUrls, ticket.partSize);
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

/**
 * Le transport est neutre (cf. `shared/lib/upload.ts`) : c'est ici que ses deux échecs prennent
 * les libellés de la MESSAGERIE. Les distinguer n'est pas cosmétique — « vérifie ta connexion »
 * sur une signature invalide envoie chercher la panne au mauvais endroit.
 */
function toMessageMediaError(error: unknown): unknown {
  if (error instanceof StorageUploadError) {
    return new MediaRejectedError(
      error.reason === "unreachable"
        ? "messages.media.storageUnreachable"
        : "messages.media.storageRejected",
    );
  }
  return error;
}

/**
 * Ouvre la galerie sur une sélection MULTIPLE (#156). `selectionLimit` n'est pas le garde-fou — il
 * est ignoré sur Android avant 13 — c'est `maxItems` côté lot qui borne réellement.
 */
async function pickImagesOrVideos(): Promise<ImagePicker.ImagePickerAsset[]> {
  // Permission demandée au moment de l'usage, pas au lancement.
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new MediaRejectedError("messages.media.permission");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: MAX_MESSAGE_MEDIA_BATCH,
    quality: 1, // compression photo maîtrisée par nos soins (dimension + qualité)
  });
  return result.canceled ? [] : result.assets;
}

// Descripteur commun à la demande d'URL et à l'envoi : une source, pas de dérive entre la taille
// signée et la taille rattachée.
function toUploadUrlInput(media: PreparedMessageMedia): RequestMessageUploadUrlInput {
  if (media.type === MessageType.IMAGE) {
    return {
      type: media.type,
      fileName: media.fileName,
      mimeType: media.mimeType,
      size: media.size,
    };
  }
  // AUDIO et VIDEO portent tous deux `durationSeconds` ; le cast couvre l'union que TS ne narrow
  // pas quand `type` et `mimeType` restent tous les deux ouverts.
  return {
    type: media.type,
    fileName: media.fileName,
    mimeType: media.mimeType,
    size: media.size,
    durationSeconds: media.durationSeconds,
  } as RequestMessageUploadUrlInput;
}
