import {
  apiErrorMessage,
  FEEDBACK_PHOTO_MAX_DIMENSION_PX,
  type FeedbackVideoMimeType,
  isAllowedFeedbackVideoMime,
  MediaType,
  megabytesOf,
  minutesOf,
} from "@cmv/shared";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import type { TFunction } from "i18next";
import type { RecordedAudio } from "@/shared/component";

/**
 * Préparation d'un média avant envoi, côté MOBILE — partagée par le débrief et la messagerie (#96).
 *
 * Promue depuis les `media.util.ts` du débrief et de la messagerie, qui étaient copie l'un de
 * l'autre à ceci près qu'ils avaient commencé à DIVERGER : les plafonds étaient vérifiés dans le util
 * côté messagerie et dans le hook côté débrief, une photo gardait son nom ici et recevait un
 * horodatage là, et le même refus portait deux noms de clé. C'est le déclencheur que #96 attendait.
 *
 * Elle s'arrête au mobile, volontairement : #96 refuse un util partagé mobile↔web, les deux
 * implémentations n'ayant rien en commun — ici `expo-image-manipulator` et `ImagePickerAsset`, là
 * `File`/`Blob`/`<video>`. Ce qui EST commun aux deux plateformes vit dans les schémas Zod de
 * `@cmv/shared` (mimes, tailles, durées), et c'est ce que ce module consomme.
 *
 * Ce qui varie d'une feature à l'autre est passé en `MediaProfile`, jamais deviné.
 */

/**
 * Les clés i18n des refus, **littérales et fournies par la feature** plutôt qu'assemblées depuis un
 * préfixe. Une clé assemblée n'est vue ni par TypeScript ni par `check:i18n` ; déclarées en clair,
 * elles sont vérifiées comme n'importe quelle autre.
 *
 * Cette table est plus courte que sa jumelle web (#26), et les trois absences se justifient une par
 * une : pas d'`imageFormat` — c'est nous qui produisons le JPEG, jamais un mime tiers ; pas
 * d'`audioFormat` — `expo-audio` en preset HIGH_QUALITY ne rend que du m4a ; pas d'`unsupported` —
 * `assetMediaKind` est TOTALE, le picker ne rendant qu'images et vidéos. En revanche `uploadError`
 * s'y ajoute, qui n'existe pas côté web : c'est le repli de `mediaErrorMessage`, plus bas.
 */
export type MediaRejectionKeys = {
  imageTooBig: string;
  videoFormat: string;
  videoTooBig: string;
  videoTooLong: string;
  audioTooBig: string;
  audioTooLong: string;
  unreadable: string;
  uploadError: string;
};

export type MediaProfile = {
  imageMaxBytes: number;
  videoMaxBytes: number;
  videoMaxDurationSeconds: number;
  audioMaxBytes: number;
  audioMaxDurationSeconds: number;
  keys: MediaRejectionKeys;
};

/**
 * Un fichier prêt à partir : la taille est MESURÉE sur le fichier final (après compression), jamais
 * celle annoncée par le picker — l'API signe l'URL avec, et le storage la vérifie.
 *
 * Discriminé sur `MediaType` et non `MessageType` : les deux portent les mêmes valeurs de chaîne,
 * `MessageType` n'ajoutant que `TEXT`, qui n'est pas un média.
 */
export type PreparedMedia =
  | {
      type: typeof MediaType.IMAGE;
      uri: string;
      fileName: string;
      // Le littéral, et non `FeedbackImageMimeType` : `preparePhoto` réencode TOUT en JPEG, si
      // bien qu'aucun autre mime ne peut sortir d'ici.
      mimeType: "image/jpeg";
      size: number;
    }
  | {
      type: typeof MediaType.VIDEO;
      uri: string;
      fileName: string;
      mimeType: FeedbackVideoMimeType;
      size: number;
      durationSeconds: number;
    }
  | {
      type: typeof MediaType.AUDIO;
      uri: string;
      fileName: string;
      // Idem : l'enregistreur mobile n'a pas d'autre sortie. C'est plus étroit que
      // `FeedbackAudioMimeType` ET que `MessageAudioMimeType`, donc acceptable des deux côtés.
      mimeType: "audio/m4a";
      size: number;
      durationSeconds: number;
    };

/**
 * Refus métier destiné à l'utilisateur (fichier trop lourd, format non géré) : porte une clé i18n
 * et ses paramètres. Distinct d'une panne technique, qui remonte telle quelle.
 *
 * Les `params` ne sont pas du confort : sans eux, les messages citaient les plafonds EN DUR et se
 * sont mis à mentir dès que les constantes ont bougé — sans qu'aucune porte ne le voie,
 * `check:i18n` vérifiant l'existence des clés et non la véracité de leur contenu.
 */
export class MediaRejectedError extends Error {
  constructor(
    readonly reasonKey: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(reasonKey);
  }
}

function fileSize(uri: string, profile: MediaProfile): number {
  const size = new File(uri).size;
  if (size == null) {
    throw new MediaRejectedError(profile.keys.unreadable);
  }
  return size;
}

/**
 * Compresse une photo AVANT l'upload (CDC §10) : redimensionnée au plus grand côté puis réencodée
 * en JPEG. Une photo de smartphone fait 3 à 8 Mo ; on descend à quelques centaines de Ko sans perte
 * visible sur un écran — c'est autant de stockage et de data en moins pour l'athlète, souvent en 4G
 * depuis une salle.
 */
async function preparePhoto(
  asset: ImagePickerAsset,
  profile: MediaProfile,
): Promise<PreparedMedia> {
  const context = ImageManipulator.manipulate(asset.uri);
  // Une seule dimension est contrainte : `expo-image-manipulator` conserve le ratio, et borner les
  // deux déformerait une photo prise en paysage.
  const resized =
    asset.width >= asset.height
      ? context.resize({ width: FEEDBACK_PHOTO_MAX_DIMENSION_PX })
      : context.resize({ height: FEEDBACK_PHOTO_MAX_DIMENSION_PX });

  const image = await resized.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

  const size = fileSize(saved.uri, profile);
  // Après compression, donc : c'est la taille finale qui est signée dans l'URL, et le storage
  // refuse tout autre poids.
  if (size > profile.imageMaxBytes) {
    throw new MediaRejectedError(profile.keys.imageTooBig, {
      max: megabytesOf(profile.imageMaxBytes),
    });
  }

  // Le nom SOURCE est conservé quand il y en a un, avec l'extension refaite d'après le résultat.
  // Ce n'est pas cosmétique : c'est ce nom que le coach lit dans la galerie du débrief côté web
  // (`FeedbackMediaGallery`), où « voie-rouge-8a.jpg » dit ce qu'un horodatage ne dit pas. Le repli
  // horodaté ne sert qu'aux captures caméra, qui n'ont pas de nom. Aucun risque de collision de
  // part ni d'autre : la clé objet porte déjà un préfixe UUID côté API.
  const name = baseName(asset.fileName) ?? `photo-${Date.now()}`;

  return {
    type: MediaType.IMAGE,
    uri: saved.uri,
    fileName: `${name}.jpg`,
    mimeType: "image/jpeg",
    size,
  };
}

/**
 * La vidéo n'est PAS transcodée : le picker borne la durée à la capture, et l'on refuse ce qui
 * dépasse les plafonds plutôt que d'embarquer un encodeur natif (cf. dettes P4-1/P4-2). Le refus
 * est explicite — jamais un upload tronqué.
 *
 * La durée est contrôlée AVANT la taille : elle est déjà connue de l'asset, là où mesurer le
 * fichier est une lecture disque qu'une vidéo trop longue ne mérite pas.
 */
function prepareVideo(asset: ImagePickerAsset, profile: MediaProfile): PreparedMedia {
  const mimeType = asset.mimeType;
  if (mimeType == null || !isAllowedFeedbackVideoMime(mimeType)) {
    throw new MediaRejectedError(profile.keys.videoFormat);
  }

  // `duration` est en millisecondes côté picker, en secondes côté API.
  if (asset.duration == null) {
    throw new MediaRejectedError(profile.keys.unreadable);
  }
  const durationSeconds = Math.ceil(asset.duration / 1000);
  if (durationSeconds > profile.videoMaxDurationSeconds) {
    throw new MediaRejectedError(profile.keys.videoTooLong, {
      max: profile.videoMaxDurationSeconds,
    });
  }

  const size = fileSize(asset.uri, profile);
  if (size > profile.videoMaxBytes) {
    throw new MediaRejectedError(profile.keys.videoTooBig, {
      max: megabytesOf(profile.videoMaxBytes),
    });
  }

  return {
    type: MediaType.VIDEO,
    uri: asset.uri,
    fileName: asset.fileName ?? `video-${Date.now()}.mp4`,
    mimeType,
    size,
    durationSeconds,
  };
}

/**
 * Aiguillage commun aux deux features. L'aiguillage lui-même — « tout ce qui n'est pas une vidéo
 * est une photo » — est celui qu'`assetMediaKind` reproduit pour répartir un lot dans les places
 * restantes : deux lectures différentes feraient qu'un média occupe une place de photo et se
 * prépare comme une vidéo.
 */
export function prepareMedia(
  asset: ImagePickerAsset,
  profile: MediaProfile,
): Promise<PreparedMedia> {
  return asset.type === "video"
    ? Promise.resolve(prepareVideo(asset, profile))
    : preparePhoto(asset, profile);
}

/**
 * Note vocale enregistrée (expo-audio, preset HIGH_QUALITY → m4a/AAC). Taille mesurée sur le
 * fichier ; durée déclarée par l'enregistreur (pas de décodage — cf. dette P4-2).
 */
export function prepareAudio(audio: RecordedAudio, profile: MediaProfile): PreparedMedia {
  if (audio.durationSeconds > profile.audioMaxDurationSeconds) {
    throw new MediaRejectedError(profile.keys.audioTooLong, {
      max: minutesOf(profile.audioMaxDurationSeconds),
    });
  }
  const size = fileSize(audio.uri, profile);
  if (size > profile.audioMaxBytes) {
    throw new MediaRejectedError(profile.keys.audioTooBig, {
      max: megabytesOf(profile.audioMaxBytes),
    });
  }
  return {
    type: MediaType.AUDIO,
    uri: audio.uri,
    fileName: `note-${Date.now()}.m4a`,
    mimeType: "audio/m4a",
    size,
    durationSeconds: audio.durationSeconds,
  };
}

/**
 * Ce que dit un envoi de média qui a échoué.
 *
 * Trois provenances, trois traitements, et aucune ne se masque : un refus métier (format non géré,
 * note trop longue) porte sa propre clé i18n ; une panne technique garde le message de l'API ; le
 * refus d'une permission — micro, galerie — précède tout envoi et arrive donc à la main, hors
 * mutation.
 */
export function mediaErrorMessage(
  error: unknown,
  manualKey: string | null,
  t: TFunction,
  profile: MediaProfile,
): string | null {
  if (manualKey != null) return t(manualKey);
  if (error == null) return null;
  if (error instanceof MediaRejectedError) return t(error.reasonKey, error.params);
  return apiErrorMessage(error) ?? t(profile.keys.uploadError);
}

function baseName(fileName: string | null | undefined): string | null {
  if (fileName == null) return null;
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension.length === 0 ? null : withoutExtension;
}
