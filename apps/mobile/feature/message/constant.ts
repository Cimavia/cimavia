import {
  MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  MAX_MESSAGE_AUDIO_SIZE_BYTES,
  MAX_MESSAGE_IMAGE_SIZE_BYTES,
  MAX_MESSAGE_VIDEO_DURATION_SECONDS,
  MAX_MESSAGE_VIDEO_SIZE_BYTES,
} from "@cmv/shared";
import type { MediaProfile } from "@/shared/util/media.util";

/**
 * Ce que la messagerie accepte comme média, tel que son schéma Zod le définit — la source reste
 * `@cmv/shared`, on ne fait ici que la rassembler pour l'util de préparation.
 *
 * Aucun `audioMimeTypes` ici, contrairement au profil web : sur mobile, la note vocale sort
 * toujours de `expo-audio` en m4a, que les deux schémas acceptent. Le webm, qui sépare les deux
 * catalogues côté navigateur (dette P5-3), n'a pas de producteur sur cette plateforme.
 */
export const MESSAGE_MEDIA_PROFILE: MediaProfile = {
  imageMaxBytes: MAX_MESSAGE_IMAGE_SIZE_BYTES,
  videoMaxBytes: MAX_MESSAGE_VIDEO_SIZE_BYTES,
  videoMaxDurationSeconds: MAX_MESSAGE_VIDEO_DURATION_SECONDS,
  audioMaxBytes: MAX_MESSAGE_AUDIO_SIZE_BYTES,
  audioMaxDurationSeconds: MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  keys: {
    imageTooBig: "messages.media.imageTooBig",
    videoFormat: "messages.media.videoFormat",
    videoTooBig: "messages.media.videoTooBig",
    videoTooLong: "messages.media.videoTooLong",
    audioTooBig: "messages.media.audioTooBig",
    audioTooLong: "messages.media.audioTooLong",
    unreadable: "messages.media.unreadable",
    uploadError: "messages.media.uploadError",
  },
};

/**
 * Les notes qu'une capture peut produire dans le fil (#856) : au plafond, la parole continue dans
 * une note neuve, jusqu'à ce compte — 15 min de parole d'un tenant. Le débrief a son quota ; le fil
 * n'en a pas, et un micro oublié en poche enverrait sinon une note toutes les 5 min, écran gardé
 * allumé, jusqu'à la batterie vide.
 */
export const MESSAGE_AUDIO_NOTES_PER_CAPTURE = 3;
