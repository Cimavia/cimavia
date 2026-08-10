import {
  type FeedbackImageMimeType,
  type FeedbackVideoMimeType,
  isAllowedFeedbackImageMime,
  isAllowedFeedbackVideoMime,
  MediaType,
} from "@cmv/shared";

/**
 * Préparation d'un média avant envoi, côté WEB — partagée par la messagerie et le débrief (#26).
 *
 * Promue de `feature/message/util/` : deux consommateurs dans la même app, donc la règle de
 * promotion (`architecture-choice.md` §3) s'applique. Elle s'arrête là, volontairement : l'issue
 * #96 refuse explicitement un util partagé mobile↔web, parce que les implémentations n'ont rien en
 * commun — ici `File`/`Blob`/`<video>`, là `expo-image-manipulator` et `ImagePickerAsset`. Ce qui
 * EST commun aux deux plateformes vit déjà dans les schémas Zod de `@cmv/shared` (mimes, tailles,
 * durées), et c'est ce que ce module consomme.
 *
 * Ce qui varie d'une feature à l'autre est passé en `MediaProfile`, jamais deviné : les plafonds,
 * les mimes audio acceptés, et les clés i18n du refus.
 */

// Un média prêt à envoyer : le fichier à uploader + son descripteur (signé, puis rattaché).
export type PreparedWebMedia =
  | {
      type: typeof MediaType.IMAGE;
      file: File;
      fileName: string;
      mimeType: FeedbackImageMimeType;
      size: number;
    }
  | {
      type: typeof MediaType.VIDEO;
      file: File;
      fileName: string;
      mimeType: FeedbackVideoMimeType;
      size: number;
      durationSeconds: number;
    }
  | {
      type: typeof MediaType.AUDIO;
      file: File;
      fileName: string;
      mimeType: string;
      size: number;
      durationSeconds: number;
    };

/**
 * Les clés i18n des refus, **littérales et fournies par la feature** plutôt qu'assemblées depuis un
 * préfixe passé en paramètre. Une clé assemblée n'est vue ni par TypeScript ni par i18next, et
 * `check:i18n` ne sait la vérifier qu'à moitié. Ici chaque feature déclare les siennes en clair,
 * donc elles sont vérifiées comme n'importe quelle autre — c'est tout l'intérêt de cette table.
 */
export type MediaRejectionKeys = {
  imageFormat: string;
  imageTooBig: string;
  videoFormat: string;
  videoTooBig: string;
  videoTooLong: string;
  audioFormat: string;
  audioTooBig: string;
  audioTooLong: string;
  unreadable: string;
  unsupported: string;
};

export type MediaProfile = {
  imageMaxBytes: number;
  videoMaxBytes: number;
  videoMaxDurationSeconds: number;
  audioMaxBytes: number;
  audioMaxDurationSeconds: number;
  /**
   * Les mimes audio que le SCHÉMA de cette feature accepte — pas ceux que le navigateur sait
   * produire. La différence n'est pas théorique : `MESSAGE_AUDIO_MIME_TYPES` contient `audio/webm`,
   * `FEEDBACK_AUDIO_MIME_TYPES` non. Un webm envoyé à un débrief est refusé en 400 à la signature
   * de l'URL, avant qu'un octet parte (cf. `pickRecorderMimeType`).
   */
  audioMimeTypes: readonly string[];
  keys: MediaRejectionKeys;
};

// Refus métier destiné à l'utilisateur (format non géré, trop lourd) : porte une clé i18n.
// Distinct d'une panne technique, qui remonte telle quelle.
export class MediaRejectedError extends Error {
  constructor(readonly reasonKey: string) {
    super(reasonKey);
  }
}

// Source avant préparation : un fichier joint (image/vidéo) ou une note vocale enregistrée.
export type WebMediaSource =
  | { kind: "file"; file: File }
  | { kind: "audio"; blob: Blob; durationSeconds: number };

/**
 * Le mime d'enregistrement à demander à `MediaRecorder`, ou `null` si ce navigateur ne sait
 * produire AUCUN format que la feature accepte.
 *
 * `audio/mp4` d'abord (correctif court de #82) : c'est le seul format lisible partout, iOS compris.
 * `audio/webm`, que Chrome et Firefox préfèrent, n'est accepté que par la messagerie — et même là
 * il reste illisible par un athlète iOS, ce qui est la dette P5-3.
 *
 * `null` n'est pas un cas d'erreur à rattraper plus tard : c'est ce qui doit faire disparaître le
 * bouton d'enregistrement AVANT qu'on enregistre trente secondes pour un 400.
 */
export function pickRecorderMimeType(allowed: readonly string[]): string | null {
  const supported = allowed.filter((mime) => MediaRecorder.isTypeSupported(mime));
  return supported.find((mime) => mime === "audio/mp4") ?? supported[0] ?? null;
}

export function prepareImageFile(file: File, profile: MediaProfile): PreparedWebMedia {
  if (!isAllowedFeedbackImageMime(file.type)) {
    throw new MediaRejectedError(profile.keys.imageFormat);
  }
  if (file.size > profile.imageMaxBytes) {
    throw new MediaRejectedError(profile.keys.imageTooBig);
  }
  return {
    type: MediaType.IMAGE,
    file,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

export async function prepareVideoFile(
  file: File,
  profile: MediaProfile,
): Promise<PreparedWebMedia> {
  if (!isAllowedFeedbackVideoMime(file.type)) {
    throw new MediaRejectedError(profile.keys.videoFormat);
  }
  if (file.size > profile.videoMaxBytes) {
    throw new MediaRejectedError(profile.keys.videoTooBig);
  }
  const durationSeconds = await readVideoDuration(file, profile);
  if (durationSeconds > profile.videoMaxDurationSeconds) {
    throw new MediaRejectedError(profile.keys.videoTooLong);
  }
  return {
    type: MediaType.VIDEO,
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
export function prepareAudioBlob(
  blob: Blob,
  durationSeconds: number,
  profile: MediaProfile,
): PreparedWebMedia {
  const mimeType = blob.type.split(";")[0] ?? "";
  if (!profile.audioMimeTypes.includes(mimeType)) {
    throw new MediaRejectedError(profile.keys.audioFormat);
  }
  if (durationSeconds > profile.audioMaxDurationSeconds) {
    throw new MediaRejectedError(profile.keys.audioTooLong);
  }
  const extension = mimeType === "audio/webm" ? "webm" : "m4a";
  const fileName = `note-${Date.now()}.${extension}`;
  const file = new File([blob], fileName, { type: mimeType });
  if (file.size > profile.audioMaxBytes) {
    throw new MediaRejectedError(profile.keys.audioTooBig);
  }
  return { type: MediaType.AUDIO, file, fileName, mimeType, size: file.size, durationSeconds };
}

// Aiguillage commun aux deux features : un fichier joint se prépare selon son type, une note
// vocale selon le sien.
export function prepareWebMedia(
  source: WebMediaSource,
  profile: MediaProfile,
): Promise<PreparedWebMedia> | PreparedWebMedia {
  if (source.kind === "audio") {
    return prepareAudioBlob(source.blob, source.durationSeconds, profile);
  }
  if (source.file.type.startsWith("image/")) return prepareImageFile(source.file, profile);
  if (source.file.type.startsWith("video/")) return prepareVideoFile(source.file, profile);
  throw new MediaRejectedError(profile.keys.unsupported);
}

// Durée d'une vidéo, lue via un élément <video> hors-écran (le schéma l'exige à l'upload).
function readVideoDuration(file: File, profile: MediaProfile): Promise<number> {
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
      reject(new MediaRejectedError(profile.keys.unreadable));
    };
    video.src = url;
  });
}
