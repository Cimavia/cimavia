import {
  FEEDBACK_PHOTO_MAX_DIMENSION_PX,
  type FeedbackImageMimeType,
  type FeedbackVideoMimeType,
  isAllowedFeedbackVideoMime,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MediaType,
} from "@cmv/shared";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";

// Un fichier prêt à partir : la taille est MESURÉE sur le fichier final (après compression),
// jamais celle annoncée par le picker — l'API signe l'URL avec, et le storage la vérifie.
export type PreparedMedia =
  | {
      type: typeof MediaType.IMAGE;
      uri: string;
      fileName: string;
      mimeType: FeedbackImageMimeType;
      size: number;
    }
  | {
      type: typeof MediaType.VIDEO;
      uri: string;
      fileName: string;
      mimeType: FeedbackVideoMimeType;
      size: number;
      durationSeconds: number;
    };

// Erreur métier destinée à l'utilisateur (fichier trop lourd, format non géré) : le rendu la
// traduit. Distincte d'une panne technique, qui remonte telle quelle.
export class MediaRejectedError extends Error {
  constructor(readonly reasonKey: string) {
    super(reasonKey);
  }
}

function fileSize(uri: string): number {
  const size = new File(uri).size;
  if (size == null) {
    throw new MediaRejectedError("feedback.media.unreadable");
  }
  return size;
}

/**
 * Compresse une photo AVANT l'upload (CDC §10) : redimensionnée au plus grand côté puis
 * réencodée en JPEG. Une photo de smartphone fait 3 à 8 Mo ; on descend à quelques centaines de
 * Ko sans perte visible sur un écran — c'est autant de stockage et de data en moins pour
 * l'athlète, souvent en 4G depuis une salle.
 */
async function preparePhoto(asset: ImagePickerAsset): Promise<PreparedMedia> {
  const context = ImageManipulator.manipulate(asset.uri);
  // Une seule dimension est contrainte : `expo-image-manipulator` conserve le ratio, et borner
  // les deux déformerait une photo prise en paysage.
  const resized =
    asset.width >= asset.height
      ? context.resize({ width: FEEDBACK_PHOTO_MAX_DIMENSION_PX })
      : context.resize({ height: FEEDBACK_PHOTO_MAX_DIMENSION_PX });

  const image = await resized.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

  return {
    type: MediaType.IMAGE,
    uri: saved.uri,
    // Le nom d'origine peut être absent (capture caméra) et l'extension a changé : on nomme
    // d'après le résultat, pas d'après la source.
    fileName: `${baseName(asset.fileName) ?? "photo"}.jpg`,
    mimeType: "image/jpeg",
    size: fileSize(saved.uri),
  };
}

/**
 * La vidéo n'est PAS transcodée : le picker borne la durée à la capture, et l'on refuse ce qui
 * dépasse les plafonds plutôt que d'embarquer un encodeur natif (cf. dette P4). Le refus est
 * explicite — jamais un upload tronqué.
 */
function prepareVideo(asset: ImagePickerAsset): PreparedMedia {
  const mimeType = asset.mimeType;
  if (mimeType == null || !isAllowedFeedbackVideoMime(mimeType)) {
    throw new MediaRejectedError("feedback.media.videoFormat");
  }

  // `duration` est en millisecondes côté picker, en secondes côté API.
  if (asset.duration == null) {
    throw new MediaRejectedError("feedback.media.unreadable");
  }
  const durationSeconds = Math.ceil(asset.duration / 1000);
  if (durationSeconds > MAX_FEEDBACK_VIDEO_DURATION_SECONDS) {
    throw new MediaRejectedError("feedback.media.videoDuration");
  }

  return {
    type: MediaType.VIDEO,
    uri: asset.uri,
    fileName: asset.fileName ?? "video.mp4",
    mimeType,
    size: fileSize(asset.uri),
    durationSeconds,
  };
}

export function prepareMedia(asset: ImagePickerAsset): Promise<PreparedMedia> {
  return asset.type === "video" ? Promise.resolve(prepareVideo(asset)) : preparePhoto(asset);
}

function baseName(fileName: string | null | undefined): string | null {
  if (fileName == null) return null;
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension.length === 0 ? null : withoutExtension;
}
