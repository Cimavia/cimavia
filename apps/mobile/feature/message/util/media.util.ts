import {
  FEEDBACK_PHOTO_MAX_DIMENSION_PX,
  type FeedbackImageMimeType,
  type FeedbackVideoMimeType,
  isAllowedFeedbackVideoMime,
  MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  MAX_MESSAGE_AUDIO_SIZE_BYTES,
  MAX_MESSAGE_IMAGE_SIZE_BYTES,
  MAX_MESSAGE_VIDEO_DURATION_SECONDS,
  MAX_MESSAGE_VIDEO_SIZE_BYTES,
  type MessageAudioMimeType,
  MessageType,
} from "@cmv/shared";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import type { RecordedAudio } from "@/shared/component";

// Fichier prêt à partir : la taille est MESURÉE sur le fichier final (après compression), jamais
// celle annoncée — l'API signe l'URL avec, et le storage la vérifie. Même flux que le débrief ;
// à promouvoir en util partagé si un 3ᵉ consommateur apparaît.
export type PreparedMessageMedia =
  | {
      type: typeof MessageType.AUDIO;
      uri: string;
      fileName: string;
      mimeType: MessageAudioMimeType;
      size: number;
      durationSeconds: number;
    }
  | {
      type: typeof MessageType.IMAGE;
      uri: string;
      fileName: string;
      mimeType: FeedbackImageMimeType;
      size: number;
    }
  | {
      type: typeof MessageType.VIDEO;
      uri: string;
      fileName: string;
      mimeType: FeedbackVideoMimeType;
      size: number;
      durationSeconds: number;
    };

// Refus métier destiné à l'utilisateur (trop lourd, format non géré) : le rendu le traduit.
// Distinct d'une panne technique, qui remonte telle quelle.
export class MediaRejectedError extends Error {
  constructor(readonly reasonKey: string) {
    super(reasonKey);
  }
}

function fileSize(uri: string): number {
  const size = new File(uri).size;
  if (size == null) {
    throw new MediaRejectedError("messages.media.unreadable");
  }
  return size;
}

// Note vocale enregistrée (expo-audio, preset HIGH_QUALITY → m4a/AAC). Taille mesurée sur le
// fichier ; durée déclarée par l'enregistreur (pas de décodage — cf. dette P4-2).
export function prepareAudio(audio: RecordedAudio): PreparedMessageMedia {
  if (audio.durationSeconds > MAX_MESSAGE_AUDIO_DURATION_SECONDS) {
    throw new MediaRejectedError("messages.media.audioTooLong");
  }
  const size = fileSize(audio.uri);
  if (size > MAX_MESSAGE_AUDIO_SIZE_BYTES) {
    throw new MediaRejectedError("messages.media.audioTooBig");
  }
  return {
    type: MessageType.AUDIO,
    uri: audio.uri,
    fileName: `note-${Date.now()}.m4a`,
    mimeType: "audio/m4a",
    size,
    durationSeconds: audio.durationSeconds,
  };
}

// Photo compressée avant l'upload (redimensionnée au plus grand côté puis JPEG) — même politique
// que le débrief.
async function preparePhoto(asset: ImagePickerAsset): Promise<PreparedMessageMedia> {
  const context = ImageManipulator.manipulate(asset.uri);
  const resized =
    asset.width >= asset.height
      ? context.resize({ width: FEEDBACK_PHOTO_MAX_DIMENSION_PX })
      : context.resize({ height: FEEDBACK_PHOTO_MAX_DIMENSION_PX });

  const image = await resized.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

  const size = fileSize(saved.uri);
  if (size > MAX_MESSAGE_IMAGE_SIZE_BYTES) {
    throw new MediaRejectedError("messages.media.imageTooBig");
  }
  return {
    type: MessageType.IMAGE,
    uri: saved.uri,
    fileName: `photo-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
    size,
  };
}

// Vidéo NON transcodée (le picker borne la durée à la capture) : on refuse ce qui dépasse plutôt
// que d'embarquer un encodeur natif (cf. dette P4-1).
function prepareVideo(asset: ImagePickerAsset): PreparedMessageMedia {
  const mimeType = asset.mimeType;
  if (mimeType == null || !isAllowedFeedbackVideoMime(mimeType)) {
    throw new MediaRejectedError("messages.media.videoFormat");
  }
  if (asset.duration == null) {
    throw new MediaRejectedError("messages.media.unreadable");
  }
  const durationSeconds = Math.ceil(asset.duration / 1000);
  if (durationSeconds > MAX_MESSAGE_VIDEO_DURATION_SECONDS) {
    throw new MediaRejectedError("messages.media.videoTooLong");
  }
  const size = fileSize(asset.uri);
  if (size > MAX_MESSAGE_VIDEO_SIZE_BYTES) {
    throw new MediaRejectedError("messages.media.videoTooBig");
  }
  return {
    type: MessageType.VIDEO,
    uri: asset.uri,
    fileName: asset.fileName ?? `video-${Date.now()}.mp4`,
    mimeType,
    size,
    durationSeconds,
  };
}

export function prepareAsset(asset: ImagePickerAsset): Promise<PreparedMessageMedia> {
  return asset.type === "video" ? Promise.resolve(prepareVideo(asset)) : preparePhoto(asset);
}
