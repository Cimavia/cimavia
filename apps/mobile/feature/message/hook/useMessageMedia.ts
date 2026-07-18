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

/**
 * Envoi d'un média dans un fil : préparation (compression/mesure) → URL signée → upload direct →
 * message. Le binaire ne passe jamais par l'API. Deux entrées, un même pipeline : une pièce jointe
 * choisie dans la galerie, ou une note vocale enregistrée.
 */
export function useSendMessageMedia(conversationId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: messageKeys.list(conversationId) });
    queryClient.invalidateQueries({ queryKey: conversationKeys.mine() });
  };

  const pickAndSend = useMutation({
    mutationFn: async () => {
      const asset = await pickImageOrVideo();
      if (asset == null) return null; // sélection annulée : ce n'est pas une erreur
      return uploadAndSend(conversationId, await prepareAsset(asset));
    },
    onSuccess: (message) => {
      if (message != null) invalidate();
    },
  });

  const recordAndSend = useMutation({
    mutationFn: (audio: RecordedAudio) => uploadAndSend(conversationId, prepareAudio(audio)),
    onSuccess: invalidate,
  });

  return { pickAndSend, recordAndSend };
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
