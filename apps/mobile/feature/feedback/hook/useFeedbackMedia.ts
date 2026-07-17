import type { SessionFeedbackDto } from "@cmv/shared";
import {
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MediaType,
  type MediaTypeType,
  maxFeedbackMediaCount,
  maxFeedbackMediaSizeBytes,
} from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import {
  attachMedia,
  deleteMedia,
  feedbackKeys,
  requestMediaUploadUrl,
} from "@/feature/feedback/api";
import {
  MediaRejectedError,
  type PreparedMedia,
  prepareMedia,
} from "@/feature/feedback/util/media.util";
import { planKeys, scheduledSessionKeys } from "@/feature/plan/api";

// Après un ajout/retrait de média, la séance a pu passer en DONE : le planning et le détail
// doivent suivre, sinon ils afficheraient encore « À faire ».
function useInvalidateFeedback(sessionId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(sessionId) });
    queryClient.invalidateQueries({ queryKey: scheduledSessionKeys.detail(sessionId) });
    queryClient.invalidateQueries({ queryKey: planKeys.current() });
  };
}

/**
 * Ajoute un média au débrief : sélection → compression → URL signée → upload direct → rattachement.
 *
 * L'upload passe par `uploadAsync` et non `fetch` : le fichier est streamé depuis le disque, là
 * où un `blob` chargerait 50 Mo de vidéo en mémoire. Il pose aussi le `Content-Length` exact,
 * que l'URL signée impose (le storage rejette tout autre poids).
 */
export function useAddFeedbackMedia(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);

  return useMutation({
    mutationFn: async (type: MediaTypeType) => {
      const asset = await pickAsset(type);
      if (asset == null) return null; // sélection annulée : ce n'est pas une erreur

      const media = await prepareMedia(asset);
      if (media.size > maxFeedbackMediaSizeBytes(type)) {
        throw new MediaRejectedError(
          type === MediaType.VIDEO ? "feedback.media.videoTooBig" : "feedback.media.photoTooBig",
        );
      }

      const signed = await requestMediaUploadUrl(sessionId, toUploadUrlInput(media));
      await uploadToStorage(signed.uploadUrl, media);

      return attachMedia(sessionId, {
        ...toUploadUrlInput(media),
        storagePath: signed.storagePath,
      });
    },
    onSuccess: (media) => {
      if (media != null) invalidate();
    },
  });
}

export function useDeleteFeedbackMedia(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);

  return useMutation({
    mutationFn: (mediaId: string) => deleteMedia(sessionId, mediaId),
    onSuccess: invalidate,
  });
}

/**
 * Envoie le fichier au storage, directement (le binaire ne passe jamais par l'API).
 *
 * Deux échecs radicalement différents, qu'on ne confond pas :
 *  - le storage est INJOIGNABLE (`uploadAsync` lève) : réseau, ou endpoint signé pointant sur une
 *    adresse que le téléphone ne sait pas résoudre — le cas classique en dev (`localhost`) ;
 *  - le storage RÉPOND et refuse (403 signature, 400 taille…) : l'URL est bonne, l'envoi non.
 *
 * Les distinguer n'est pas cosmétique : « vérifie ta connexion » sur une signature invalide
 * envoie chercher la panne au mauvais endroit.
 */
async function uploadToStorage(uploadUrl: string, media: PreparedMedia): Promise<void> {
  let status: number;
  try {
    const upload = await uploadAsync(uploadUrl, media.uri, {
      httpMethod: "PUT",
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": media.mimeType },
    });
    status = upload.status;
  } catch {
    throw new MediaRejectedError("feedback.media.storageUnreachable");
  }

  if (status < 200 || status >= 300) {
    throw new MediaRejectedError("feedback.media.storageRejected");
  }
}

// Ce qui reste comme place, par type — le bouton d'ajout s'éteint AVANT que l'API réponde 409.
export function remainingSlots(
  feedback: SessionFeedbackDto | null | undefined,
  type: MediaTypeType,
): number {
  const used = feedback?.media.filter((item) => item.type === type).length ?? 0;
  return maxFeedbackMediaCount(type) - used;
}

async function pickAsset(type: MediaTypeType): Promise<ImagePicker.ImagePickerAsset | null> {
  // La permission est demandée au moment de l'usage, pas au lancement de l'app : l'athlète
  // comprend pourquoi on la lui demande.
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new MediaRejectedError("feedback.media.permission");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: type === MediaType.VIDEO ? ["videos"] : ["images"],
    // Borne la CAPTURE : mieux vaut empêcher une vidéo de 3 min que la refuser après coup.
    videoMaxDuration: MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
    quality: 1, // la compression photo est faite par nos soins (dimension + qualité maîtrisées)
  });

  return result.canceled ? null : (result.assets[0] ?? null);
}

// Le même descripteur sert à demander l'URL et à rattacher : une seule source, pas de dérive
// possible entre la taille signée et la taille rattachée.
function toUploadUrlInput(media: PreparedMedia) {
  return media.type === MediaType.VIDEO
    ? {
        type: MediaType.VIDEO,
        fileName: media.fileName,
        mimeType: media.mimeType,
        size: media.size,
        durationSeconds: media.durationSeconds,
      }
    : {
        type: MediaType.IMAGE,
        fileName: media.fileName,
        mimeType: media.mimeType,
        size: media.size,
      };
}
