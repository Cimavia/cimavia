import type {
  MessageDto,
  MultipartUploadTicket,
  RequestMessageUploadUrlInput,
  SendMessageInput,
} from "@cmv/shared";
import { MessageType, UploadMode } from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { messageApi, messageKeys } from "@/feature/message/api";
import {
  MediaRejectedError,
  type PreparedMessageMedia,
  prepareAsset,
  prepareAudio,
} from "@/feature/message/util/media.util";
import type { RecordedAudio } from "@/shared/component";
import { StorageUploadError, uploadFileToStorage, uploadPartsToStorage } from "@/shared/lib/upload";

// Source d'un média avant préparation : une pièce jointe choisie, ou une note vocale enregistrée.
type MediaSource =
  | { kind: "asset"; asset: ImagePicker.ImagePickerAsset }
  | { kind: "audio"; audio: RecordedAudio };

/**
 * Envoi d'un média dans un fil : préparation (compression/mesure) → URL signée → upload direct →
 * message. Le binaire ne passe jamais par l'API.
 *
 * La préparation + l'upload passent par UNE mutation, donc `isUploading` (indicateur « envoi en
 * cours ») ne couvre QUE ce qui suit la sélection. L'ouverture de la galerie, elle, se fait HORS
 * de la mutation — sinon l'indicateur s'allumerait pendant que l'utilisateur choisit encore.
 */
export function useSendMessageMedia(conversationId: string) {
  const queryClient = useQueryClient();

  const send = useMutation({
    mutationFn: async (source: MediaSource) => {
      const media =
        source.kind === "asset" ? await prepareAsset(source.asset) : prepareAudio(source.audio);
      return uploadAndSend(conversationId, media);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.myConversation() });
    },
  });

  // Ouvre la galerie puis délègue à la mutation. L'échec de sélection (permission) est signalé à
  // part — il précède l'upload, donc ne peut pas passer par `send.error`.
  const pickAndSend = async (onPickError: (reasonKey: string) => void) => {
    try {
      const asset = await pickImageOrVideo();
      if (asset != null) send.mutate({ kind: "asset", asset });
    } catch (error) {
      onPickError(
        error instanceof MediaRejectedError ? error.reasonKey : "messages.media.uploadError",
      );
    }
  };

  const recordAndSend = (audio: RecordedAudio) => send.mutate({ kind: "audio", audio });

  return { pickAndSend, recordAndSend, isUploading: send.isPending, uploadError: send.error };
}

async function uploadAndSend(
  conversationId: string,
  media: PreparedMessageMedia,
): Promise<MessageDto> {
  const uploadInput = toUploadUrlInput(media);
  // C'est l'API qui décide de la forme de l'envoi, à partir de la seule taille : au-delà du seuil,
  // un PUT unique ne franchirait pas le bord réseau (cf. `upload.schema.ts`).
  const ticket = await messageApi.requestUploadUrl(conversationId, uploadInput);
  try {
    if (ticket.mode === UploadMode.SINGLE) {
      await uploadFileToStorage(ticket.uploadUrl, media.uri, media.mimeType);
    } else {
      await sendInParts(conversationId, ticket, media);
    }
  } catch (error) {
    throw toMessageMediaError(error);
  }

  // Le message média = le même descripteur + la clé objet rendue par le ticket. Le cast couvre
  // la fusion de l'union discriminée, que TS ne sait pas prouver.
  const sendInput = { ...uploadInput, storagePath: ticket.storagePath } as SendMessageInput;
  return messageApi.sendMessage(conversationId, sendInput);
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
): Promise<void> {
  const upload = { storagePath: ticket.storagePath, uploadId: ticket.uploadId };
  try {
    await uploadPartsToStorage(media.uri, ticket.partUrls, ticket.partSize);
    await messageApi.completeMediaUpload(conversationId, {
      ...upload,
      partCount: ticket.partUrls.length,
    });
  } catch (error) {
    // L'échec de l'abandon est avalé : il ne doit pas masquer l'erreur d'origine, la seule sur
    // laquelle l'utilisateur peut agir.
    await messageApi.abortMediaUpload(conversationId, upload).catch(() => undefined);
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

async function pickImageOrVideo(): Promise<ImagePicker.ImagePickerAsset | null> {
  // Permission demandée au moment de l'usage, pas au lancement.
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new MediaRejectedError("messages.media.permission");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 1, // compression photo maîtrisée par nos soins (dimension + qualité)
  });
  return result.canceled ? null : (result.assets[0] ?? null);
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
