import {
  FEEDBACK_AUDIO_MIME_TYPES,
  MAX_FEEDBACK_AUDIO_DURATION_SECONDS,
  MAX_FEEDBACK_AUDIO_SIZE_BYTES,
  MAX_FEEDBACK_PHOTO_SIZE_BYTES,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MAX_FEEDBACK_VIDEO_SIZE_BYTES,
} from "@cmv/shared";
import type { MediaProfile } from "@/shared/util/media.util";

/**
 * Ce que le débrief accepte comme média, tel que son schéma Zod le définit.
 *
 * La différence qui compte avec la messagerie : `FEEDBACK_AUDIO_MIME_TYPES` **ne contient pas
 * `audio/webm`**. Une note vocale enregistrée en webm — ce que Chrome et Firefox produisent par
 * défaut — est refusée en 400 dès la demande d'URL signée. C'est pour ça que l'enregistreur reçoit
 * cette liste et peut s'éteindre (`isAvailable`) au lieu de laisser capturer pour rien.
 */
export const FEEDBACK_MEDIA_PROFILE: MediaProfile = {
  imageMaxBytes: MAX_FEEDBACK_PHOTO_SIZE_BYTES,
  videoMaxBytes: MAX_FEEDBACK_VIDEO_SIZE_BYTES,
  videoMaxDurationSeconds: MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  audioMaxBytes: MAX_FEEDBACK_AUDIO_SIZE_BYTES,
  audioMaxDurationSeconds: MAX_FEEDBACK_AUDIO_DURATION_SECONDS,
  audioMimeTypes: FEEDBACK_AUDIO_MIME_TYPES,
  keys: {
    imageFormat: "feedback.media.imageFormat",
    imageTooBig: "feedback.media.imageTooBig",
    videoFormat: "feedback.media.videoFormat",
    videoTooBig: "feedback.media.videoTooBig",
    videoTooLong: "feedback.media.videoTooLong",
    audioFormat: "feedback.media.audioFormat",
    audioTooBig: "feedback.media.audioTooBig",
    audioTooLong: "feedback.media.audioTooLong",
    unreadable: "feedback.media.unreadable",
    unsupported: "feedback.media.unsupported",
  },
};
