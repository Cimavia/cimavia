import type { MultipartUploadTicket, RequestFeedbackUploadUrlInput } from "@cmv/shared";
import {
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MediaType,
  type MediaTypeType,
  maxFeedbackMediaSizeBytes,
  megabytesOf,
  UploadMode,
} from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { athleteFeedbackApi, myFeedbackKeys } from "@/feature/feedback/api";
import {
  MediaRejectedError,
  type PreparedMedia,
  prepareAudio,
  prepareMedia,
} from "@/feature/feedback/util/media.util";
import { myPlanKeys } from "@/feature/plan/api";
import type { RecordedAudio } from "@/shared/component";
import { StorageUploadError, uploadFileToStorage, uploadPartsToStorage } from "@/shared/lib/upload";

// Après un ajout/retrait de média, la séance a pu passer en DONE : le planning et le détail
// doivent suivre, sinon ils afficheraient encore « À faire ».
function useInvalidateFeedback(sessionId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: myFeedbackKeys.detail(sessionId) });
    queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
    queryClient.invalidateQueries({ queryKey: myPlanKeys.current() });
  };
}

/**
 * Ajoute un média au débrief : sélection → compression → URL signée → upload direct → rattachement.
 *
 * L'upload passe par le chemin natif et non `fetch` : le fichier est streamé depuis le disque, là
 * où un `blob` chargerait la vidéo ENTIÈRE en mémoire — mesuré sur appareil, c'est un
 * OutOfMemoryError dès 400 Mo (cf. `shared/lib/upload.ts`). Il pose aussi le `Content-Length`
 * exact, que l'URL signée impose (le storage rejette tout autre poids).
 */
export function useAddFeedbackMedia(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: async (type: MediaTypeType) => {
      const asset = await pickAsset(type);
      if (asset == null) return null; // sélection annulée : ce n'est pas une erreur

      const media = await prepareMedia(asset);
      if (media.size > maxFeedbackMediaSizeBytes(type)) {
        throw new MediaRejectedError(
          type === MediaType.VIDEO ? "feedback.media.videoTooBig" : "feedback.media.photoTooBig",
          { max: megabytesOf(maxFeedbackMediaSizeBytes(type)) },
        );
      }

      setProgress(0);
      return uploadAndAttach(sessionId, media, setProgress);
    },
    onSuccess: (media) => {
      if (media != null) invalidate();
    },
  });

  return { ...mutation, progress };
}

/**
 * Débrief vocal (P5) : la note vocale vient de l'enregistreur partagé (pas d'un picker). Même flux
 * ensuite — URL signée → upload direct → rattachement — et le débrief passe en DONE.
 */
export function useAddFeedbackAudio(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: (audio: RecordedAudio) => {
      setProgress(0);
      return uploadAndAttach(sessionId, prepareAudio(audio), setProgress);
    },
    onSuccess: invalidate,
  });

  return { ...mutation, progress };
}

export function useDeleteFeedbackMedia(sessionId: string) {
  const invalidate = useInvalidateFeedback(sessionId);

  return useMutation({
    mutationFn: (mediaId: string) => athleteFeedbackApi.deleteMedia(sessionId, mediaId),
    onSuccess: invalidate,
  });
}

// Flux commun photo/vidéo/note vocale : URL signée → upload direct → rattachement. Le rattachement
// crée le débrief s'il n'existait pas encore et passe la séance en DONE (côté API).
async function uploadAndAttach(
  sessionId: string,
  media: PreparedMedia,
  onProgress: (percent: number) => void,
) {
  const input = toUploadUrlInput(media);
  // C'est l'API qui décide de la forme de l'envoi, à partir de la seule taille : au-delà du seuil,
  // un PUT unique ne franchirait pas le bord réseau (cf. `upload.schema.ts`).
  const ticket = await athleteFeedbackApi.requestMediaUploadUrl(sessionId, input);
  try {
    if (ticket.mode === UploadMode.SINGLE) {
      await uploadFileToStorage(ticket.uploadUrl, media.uri, media.mimeType, onProgress);
    } else {
      await sendInParts(sessionId, ticket, media, onProgress);
    }
  } catch (error) {
    throw toFeedbackMediaError(error);
  }

  return athleteFeedbackApi.attachMedia(sessionId, { ...input, storagePath: ticket.storagePath });
}

/**
 * Envoi découpé : les parts, puis la clôture qui les recolle en un objet. Tant qu'elle n'a pas eu
 * lieu, rien n'existe dans le bucket — le rattachement porterait sur un chemin vide.
 *
 * Tout échec ABANDONNE l'upload. Les parts déjà montées d'un upload jamais clos restent facturées
 * SANS apparaître à l'inventaire du bucket : personne ne les retrouverait pour les purger à la
 * main. On paie donc un envoi à refaire depuis le début plutôt qu'une fuite invisible.
 */
async function sendInParts(
  sessionId: string,
  ticket: MultipartUploadTicket,
  media: PreparedMedia,
  onProgress: (percent: number) => void,
): Promise<void> {
  const upload = { storagePath: ticket.storagePath, uploadId: ticket.uploadId };
  try {
    await uploadPartsToStorage(media.uri, ticket.partUrls, ticket.partSize, onProgress);
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

// Le transport est neutre (cf. `shared/lib/upload.ts`) : c'est ici que ses deux échecs prennent
// les libellés du débrief — les mêmes que ceux du PUT unique, l'athlète n'ayant que faire du mode.
function toFeedbackMediaError(error: unknown): unknown {
  if (error instanceof StorageUploadError) {
    return new MediaRejectedError(
      error.reason === "unreachable"
        ? "feedback.media.storageUnreachable"
        : "feedback.media.storageRejected",
    );
  }
  return error;
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
function toUploadUrlInput(media: PreparedMedia): RequestFeedbackUploadUrlInput {
  if (media.type === MediaType.IMAGE) {
    return {
      type: media.type,
      fileName: media.fileName,
      mimeType: media.mimeType,
      size: media.size,
    };
  }
  // VIDEO et AUDIO portent tous deux `durationSeconds` ; le cast couvre l'union que TS ne narrow
  // pas quand `type` et `mimeType` restent ouverts.
  return {
    type: media.type,
    fileName: media.fileName,
    mimeType: media.mimeType,
    size: media.size,
    durationSeconds: media.durationSeconds,
  } as RequestFeedbackUploadUrlInput;
}
