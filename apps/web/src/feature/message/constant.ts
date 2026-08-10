import {
  MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  MAX_MESSAGE_AUDIO_SIZE_BYTES,
  MAX_MESSAGE_IMAGE_SIZE_BYTES,
  MAX_MESSAGE_VIDEO_DURATION_SECONDS,
  MAX_MESSAGE_VIDEO_SIZE_BYTES,
  MESSAGE_AUDIO_MIME_TYPES,
} from "@cmv/shared";
import type { MediaProfile } from "@/shared/util/media.util";

/**
 * Ce que la messagerie accepte comme média, tel que son schéma Zod le définit — la source reste
 * `@cmv/shared`, on ne fait ici que la rassembler pour l'util de préparation.
 *
 * `MESSAGE_AUDIO_MIME_TYPES` inclut `audio/webm`, contrairement au débrief : c'est la seule
 * différence entre les deux profils, et elle vient du schéma, pas d'un choix d'UI.
 */
export const MESSAGE_MEDIA_PROFILE: MediaProfile = {
  imageMaxBytes: MAX_MESSAGE_IMAGE_SIZE_BYTES,
  videoMaxBytes: MAX_MESSAGE_VIDEO_SIZE_BYTES,
  videoMaxDurationSeconds: MAX_MESSAGE_VIDEO_DURATION_SECONDS,
  audioMaxBytes: MAX_MESSAGE_AUDIO_SIZE_BYTES,
  audioMaxDurationSeconds: MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  audioMimeTypes: MESSAGE_AUDIO_MIME_TYPES,
  keys: {
    imageFormat: "messages.media.imageFormat",
    imageTooBig: "messages.media.imageTooBig",
    videoFormat: "messages.media.videoFormat",
    videoTooBig: "messages.media.videoTooBig",
    videoTooLong: "messages.media.videoTooLong",
    audioFormat: "messages.media.audioFormat",
    audioTooBig: "messages.media.audioTooBig",
    audioTooLong: "messages.media.audioTooLong",
    unreadable: "messages.media.unreadable",
    unsupported: "messages.media.unsupported",
  },
};
