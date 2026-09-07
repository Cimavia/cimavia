import {
  MAX_FEEDBACK_AUDIO_DURATION_SECONDS,
  MAX_FEEDBACK_AUDIO_SIZE_BYTES,
  MAX_FEEDBACK_PHOTO_SIZE_BYTES,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MAX_FEEDBACK_VIDEO_SIZE_BYTES,
} from "@cmv/shared";
import type { MediaProfile } from "@/shared/util/media.util";

/**
 * Ce que le débrief accepte comme média, tel que son schéma Zod le définit — la source reste
 * `@cmv/shared`, on ne fait ici que la rassembler pour l'util de préparation.
 *
 * La seule différence qui compte avec la messagerie est le plafond de la NOTE VOCALE : 100 Mo ici
 * contre 10 Mo dans un fil. Un débrief vocal se raconte, un message se dit. Image et vidéo, elles,
 * partagent les mêmes bornes — `MAX_MESSAGE_IMAGE_SIZE_BYTES` est littéralement
 * `MAX_FEEDBACK_PHOTO_SIZE_BYTES`.
 */
export const FEEDBACK_MEDIA_PROFILE: MediaProfile = {
  imageMaxBytes: MAX_FEEDBACK_PHOTO_SIZE_BYTES,
  videoMaxBytes: MAX_FEEDBACK_VIDEO_SIZE_BYTES,
  videoMaxDurationSeconds: MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  audioMaxBytes: MAX_FEEDBACK_AUDIO_SIZE_BYTES,
  audioMaxDurationSeconds: MAX_FEEDBACK_AUDIO_DURATION_SECONDS,
  keys: {
    imageTooBig: "feedback.media.imageTooBig",
    videoFormat: "feedback.media.videoFormat",
    videoTooBig: "feedback.media.videoTooBig",
    videoTooLong: "feedback.media.videoTooLong",
    audioTooBig: "feedback.media.audioTooBig",
    audioTooLong: "feedback.media.audioTooLong",
    unreadable: "feedback.media.unreadable",
    uploadError: "feedback.media.uploadError",
  },
};
