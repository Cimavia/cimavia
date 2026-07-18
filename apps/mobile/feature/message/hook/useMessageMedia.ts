import type { MessageDto, RequestMessageUploadUrlInput, SendMessageInput } from "@cmv/shared";
import { MessageType } from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import {
  conversationKeys,
  messageKeys,
  requestMessageUploadUrl,
  sendMessage,
} from "@/feature/message/api";
import {
  MediaRejectedError,
  type PreparedMessageMedia,
  prepareAsset,
  prepareAudio,
} from "@/feature/message/util/media.util";
import type { RecordedAudio } from "@/shared/component";

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
      queryClient.invalidateQueries({ queryKey: messageKeys.list(conversationId) });
      queryClient.invalidateQueries({ queryKey: conversationKeys.mine() });
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
  const signed = await requestMessageUploadUrl(conversationId, uploadInput);
  await uploadToStorage(signed.uploadUrl, media.uri, media.mimeType);
  // Le message média = le même descripteur + la clé objet rendue par l'URL signée. Le cast couvre
  // la fusion de l'union discriminée, que TS ne sait pas prouver.
  const sendInput = { ...uploadInput, storagePath: signed.storagePath } as SendMessageInput;
  return sendMessage(conversationId, sendInput);
}

/**
 * Envoie le fichier au storage, directement. Deux échecs distingués (comme le débrief) : storage
 * INJOIGNABLE (`uploadAsync` lève — réseau, ou endpoint signé irrésoluble depuis le téléphone) vs
 * storage qui RÉPOND et refuse (403 signature, 400 taille). Ne pas les confondre : « vérifie ta
 * connexion » sur une signature invalide envoie chercher la panne au mauvais endroit.
 */
async function uploadToStorage(uploadUrl: string, uri: string, mimeType: string): Promise<void> {
  let status: number;
  try {
    const upload = await uploadAsync(uploadUrl, uri, {
      httpMethod: "PUT",
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": mimeType },
    });
    status = upload.status;
  } catch {
    throw new MediaRejectedError("messages.media.storageUnreachable");
  }
  if (status < 200 || status >= 300) {
    throw new MediaRejectedError("messages.media.storageRejected");
  }
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
