import {
  type FeedbackImageMimeType,
  type FeedbackVideoMimeType,
  isAllowedFeedbackImageMime,
  isAllowedFeedbackVideoMime,
  isAllowedMessageAudioMime,
  MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  MAX_MESSAGE_AUDIO_SIZE_BYTES,
  MAX_MESSAGE_IMAGE_SIZE_BYTES,
  MAX_MESSAGE_VIDEO_DURATION_SECONDS,
  MAX_MESSAGE_VIDEO_SIZE_BYTES,
  type MessageAudioMimeType,
  MessageType,
} from "@cmv/shared";

// Média prêt à envoyer : le fichier à uploader + son descripteur (signé, puis rattaché).
export type PreparedWebMedia =
  | {
      type: typeof MessageType.IMAGE;
      file: File;
      fileName: string;
      mimeType: FeedbackImageMimeType;
      size: number;
    }
  | {
      type: typeof MessageType.AUDIO;
      file: File;
      fileName: string;
      mimeType: MessageAudioMimeType;
      size: number;
      durationSeconds: number;
    }
  | {
      type: typeof MessageType.VIDEO;
      file: File;
      fileName: string;
      mimeType: FeedbackVideoMimeType;
      size: number;
      durationSeconds: number;
    };

// Refus métier destiné à l'utilisateur (format non géré, trop lourd) : porte une clé i18n.
export class MediaRejectedError extends Error {
  constructor(readonly reasonKey: string) {
    super(reasonKey);
  }
}

export function prepareImageFile(file: File): PreparedWebMedia {
  if (!isAllowedFeedbackImageMime(file.type)) {
    throw new MediaRejectedError("messages.media.imageFormat");
  }
  if (file.size > MAX_MESSAGE_IMAGE_SIZE_BYTES) {
    throw new MediaRejectedError("messages.media.imageTooBig");
  }
  return {
    type: MessageType.IMAGE,
    file,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

export async function prepareVideoFile(file: File): Promise<PreparedWebMedia> {
  if (!isAllowedFeedbackVideoMime(file.type)) {
    throw new MediaRejectedError("messages.media.videoFormat");
  }
  if (file.size > MAX_MESSAGE_VIDEO_SIZE_BYTES) {
    throw new MediaRejectedError("messages.media.videoTooBig");
  }
  const durationSeconds = await readVideoDuration(file);
  if (durationSeconds > MAX_MESSAGE_VIDEO_DURATION_SECONDS) {
    throw new MediaRejectedError("messages.media.videoTooLong");
  }
  return {
    type: MessageType.VIDEO,
    file,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    durationSeconds,
  };
}

/**
 * Note vocale enregistrée (MediaRecorder). Le type du blob peut porter le codec
 * (`audio/webm;codecs=opus`) : on ne garde que le type de base, qui doit correspondre au mime
 * signé ET au Content-Type envoyé (sinon la signature est rejetée).
 */
export function prepareAudioBlob(blob: Blob, durationSeconds: number): PreparedWebMedia {
  const mimeType = blob.type.split(";")[0] ?? "";
  if (!isAllowedMessageAudioMime(mimeType)) {
    throw new MediaRejectedError("messages.media.audioFormat");
  }
  if (durationSeconds > MAX_MESSAGE_AUDIO_DURATION_SECONDS) {
    throw new MediaRejectedError("messages.media.audioTooLong");
  }
  const extension = mimeType === "audio/mp4" ? "m4a" : "webm";
  const fileName = `note-${Date.now()}.${extension}`;
  const file = new File([blob], fileName, { type: mimeType });
  if (file.size > MAX_MESSAGE_AUDIO_SIZE_BYTES) {
    throw new MediaRejectedError("messages.media.audioTooBig");
  }
  return { type: MessageType.AUDIO, file, fileName, mimeType, size: file.size, durationSeconds };
}

// Durée d'une vidéo, lue via un élément <video> hors-écran (le schéma l'exige à l'upload).
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.ceil(video.duration));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new MediaRejectedError("messages.media.unreadable"));
    };
    video.src = url;
  });
}
