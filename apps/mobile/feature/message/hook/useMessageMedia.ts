import type {
  MediaBatchStep,
  MediaRecapLine,
  MediaRecapReason,
  MediaRejection,
  MessageDto,
  MessageFileMimeType,
  MessageMediaKind,
  MultipartUploadTicket,
  SendMessageInput,
  TrainingCapability,
} from "@cmv/shared";
import {
  checkMessageFile,
  MAX_MESSAGE_MEDIA_BATCH,
  MESSAGE_FILE_MIME_TYPES,
  MESSAGE_MEDIA_BATCH_SLOTS,
  MessageType,
  messageMediaKindOfMime,
  messageUploadInput,
  runMultipartUpload,
  sendMediaBatch,
  UploadMode,
} from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { messageApi, messageKeys } from "@/feature/message/api";
import { MESSAGE_MEDIA_PROFILE } from "@/feature/message/constant";
import type { RecordedAudio } from "@/shared/component";
import { useExercisedCapability } from "@/shared/hook/useExercisedCapability";
import { apiErrorMessage } from "@/shared/lib/api";
import { discardPickedFile } from "@/shared/lib/message-file";
import {
  StorageUploadError,
  sendStoragePart,
  storageFileSize,
  storagePartFailure,
  uploadFileToStorage,
} from "@/shared/lib/upload";
import {
  MediaRejectedError,
  type PreparedMedia,
  prepareAudio,
  prepareMedia,
} from "@/shared/util/media.util";
import { assetMediaKind } from "@/shared/util/media-kind.util";

/** Ce que le bouton « joindre » ouvre : la galerie, ou les fichiers de l'appareil (#771). */
export type AttachSource = "media" | "file";

/** Un PDF prêt à partir : rien à compresser ni à mesurer, seulement à borner. */
type PreparedMessageFile = {
  type: typeof MessageType.FILE;
  uri: string;
  fileName: string;
  mimeType: MessageFileMimeType;
  size: number;
};

type PreparedMessageMedia = PreparedMedia | PreparedMessageFile;

/**
 * Envoi de médias dans un fil : préparation (compression/mesure) → URL signée → upload direct →
 * message. Le binaire ne passe jamais par l'API.
 *
 * Plusieurs médias partent d'un seul geste (#156), un par un. La FILE n'est pas ici :
 * `sendMediaBatch` (@cmv/shared) la tient pour les quatre surfaces — ce hook n'apporte que le
 * transport, l'invalidation du fil, et les libellés propres à la messagerie.
 *
 * L'ouverture de la galerie se fait HORS de tout envoi : sinon l'indicateur « envoi en cours »
 * s'allumerait pendant que l'utilisateur choisit encore.
 */
export function useSendMessageMedia(
  conversationId: string,
  /**
   * Ce sur quoi les médias envoyés portent, et ce qu'il faut rafraîchir en plus du fil.
   *
   * Les deux vont ensemble : répondre en vocal depuis un débrief doit rattacher le message ET
   * faire apparaître la note là où on l'a enregistrée. Invalider le seul fil laisserait l'écran
   * du débrief afficher l'état d'avant l'envoi.
   *
   * `pinned` : titre imposé par un écran mono-titre, voir `useExercisedCapability` (#343).
   */
  options?: {
    attachment: { sessionFeedbackId: string } | undefined;
    onSent?: () => void;
    pinned?: TrainingCapability;
  },
) {
  const queryClient = useQueryClient();
  const as = useExercisedCapability(options?.pinned);
  const [step, setStep] = useState<MediaBatchStep | null>(null);

  const attachment = options?.attachment;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId, as) });
    queryClient.invalidateQueries({ queryKey: messageKeys.conversations(as) });
    options?.onSent?.();
  };

  const audio = useMutation({
    mutationFn: (recorded: RecordedAudio) =>
      // Une note vocale est un geste à elle seule : elle prévient toujours le destinataire.
      uploadAndSend(conversationId, prepareAudio(recorded, MESSAGE_MEDIA_PROFILE), as, {
        ...attachment,
        continuesBatch: false,
      }),
    onSuccess: invalidate,
  });

  /**
   * Le fil est invalidé à CHAQUE média plutôt qu'à la fin : les messages apparaissent au fur et à
   * mesure, comme si on les avait envoyés un par un — ce que l'expéditeur a fait, du reste.
   */
  const upload = async (prepare: () => Promise<PreparedMessageMedia>, current: MediaBatchStep) => {
    setStep(current);
    await uploadAndSend(
      conversationId,
      await prepare(),
      as,
      // La suite d'un lot ne pousse pas : le premier envoi abouti a déjà prévenu (#537).
      { ...attachment, continuesBatch: current.continuesBatch },
    );
    invalidate();
  };

  /**
   * Ouvre la galerie ou les fichiers, puis envoie le lot. L'échec de SÉLECTION (permission) est
   * signalé à part : il précède tout envoi, et n'a donc pas de ligne de récapitulatif où vivre.
   */
  const pickAndSend = (
    onPickError: (reasonKey: string) => void,
    source: AttachSource,
  ): Promise<MediaRecapLine[]> =>
    source === "file"
      ? pickThenSend(pickFiles, onPickError, {
          kindOf: fileMessageKind,
          nameOf: (file) => file.name,
          prepare: async (file) => prepareMessageFile(file),
          release: (file) => discardPickedFile(file.uri),
        })
      : pickThenSend(pickImagesOrVideos, onPickError, {
          kindOf: assetMediaKind,
          nameOf: (asset) => asset.fileName ?? null,
          prepare: (asset) => prepareMedia(asset, MESSAGE_MEDIA_PROFILE),
        });

  /** Le lot lui-même, quelle que soit la source. */
  const pickThenSend = async <T>(
    pick: () => Promise<T[]>,
    onPickError: (reasonKey: string) => void,
    item: {
      kindOf: (item: T) => MessageMediaKind | null;
      nameOf: (item: T) => string | null;
      prepare: (item: T) => Promise<PreparedMessageMedia>;
      /** Rend ce que la sélection a laissé sur l'appareil, envoyé ou non. */
      release?: (item: T) => void;
    },
  ): Promise<MediaRecapLine[]> => {
    let picked: T[];
    try {
      picked = await pick();
    } catch (error) {
      onPickError(
        error instanceof MediaRejectedError ? error.reasonKey : "messages.media.uploadError",
      );
      return [];
    }
    if (picked.length === 0) return []; // sélection annulée : ce n'est pas une erreur

    return sendMediaBatch({
      items: picked,
      maxItems: MAX_MESSAGE_MEDIA_BATCH,
      // Le fil n'a aucun quota : sa seule borne est celle du lot, la même pour chaque famille.
      remaining: MESSAGE_MEDIA_BATCH_SLOTS,
      kindOf: item.kindOf,
      nameOf: item.nameOf,
      send: (one, current) => upload(() => item.prepare(one), current),
      rejectedReason,
      failureReason,
    }).finally(() => {
      setStep(null);
      if (item.release != null) for (const one of picked) item.release(one);
    });
  };

  const recordAndSend = (recorded: RecordedAudio) => audio.mutate(recorded);

  return {
    pickAndSend,
    recordAndSend,
    isUploading: step != null || audio.isPending,
    step,
    /** L'échec de la NOTE VOCALE seule : les refus d'un lot vivent dans son récapitulatif. */
    audioError: audio.error,
  };
}

/**
 * Ce que dit un refus qui précède l'envoi. `noSlot` ne peut pas survenir — le fil n'a pas de quota,
 * et ses places valent le plafond du lot. `unsupported` est le fichier qui n'est pas un PDF : le
 * sélecteur ne propose que ceux-là, mais un fournisseur de documents peut mal déclarer son type.
 * Tout ce qui reste est un lot trop grand.
 */
function rejectedReason({ cause }: MediaRejection<MessageMediaKind>): MediaRecapReason {
  if (cause === "unsupported") return { key: "messages.media.unsupported", params: {} };
  return { key: "messages.media.tooMany", params: { max: MAX_MESSAGE_MEDIA_BATCH } };
}

/** Un fichier choisi n'est rangé qu'en FILE : une image passée par là reste un refus. */
function fileMessageKind(file: DocumentPicker.DocumentPickerAsset): MessageMediaKind | null {
  return messageMediaKindOfMime(file.mimeType) === MessageType.FILE ? MessageType.FILE : null;
}

/**
 * La taille est celle de la COPIE locale, la seule envoyée, et non celle que le fournisseur
 * déclare : un fichier virtuel ou converti (Drive) en annonce une autre, et le storage refuserait
 * l'objet au poids signé.
 */
function prepareMessageFile(file: DocumentPicker.DocumentPickerAsset): PreparedMessageFile {
  const check = checkMessageFile(file.mimeType ?? "", storageFileSize(file.uri));
  if (!check.accepted) throw new MediaRejectedError(check.reasonKey, check.params);
  return {
    type: MessageType.FILE,
    uri: file.uri,
    fileName: file.name,
    mimeType: check.mimeType,
    size: check.size,
  };
}

/**
 * Un refus métier porte sa clé i18n ; un refus de l'API garde son message, 429 compris (#782) ;
 * une panne (réseau, 5xx) retombe sur le message générique de l'envoi.
 */
function failureReason(error: unknown): MediaRecapReason {
  if (error instanceof MediaRejectedError) return { key: error.reasonKey, params: error.params };
  const message = apiErrorMessage(error);
  return message == null ? { key: "messages.media.uploadError", params: {} } : { message };
}

/**
 * Ce que l'envoi porte en plus du média : le débrief auquel il répond, le cas échéant, et s'il
 * prolonge un lot déjà commencé — auquel cas il ne pousse pas (#537).
 */
type SendExtra = { sessionFeedbackId?: string; continuesBatch: boolean };

async function uploadAndSend(
  conversationId: string,
  media: PreparedMessageMedia,
  // Le titre traverse jusqu'ici : un upload est une écriture dans un fil, donc scopée comme lui.
  as: TrainingCapability | null,
  extra: SendExtra,
): Promise<MessageDto> {
  const uploadInput = messageUploadInput(media);
  // C'est l'API qui décide de la forme de l'envoi, à partir de la seule taille : au-delà du seuil,
  // un PUT unique ne franchirait pas le bord réseau (cf. `upload.schema.ts`).
  const ticket = await messageApi.requestUploadUrl(conversationId, uploadInput, as);
  try {
    if (ticket.mode === UploadMode.SINGLE) {
      await uploadFileToStorage(ticket.uploadUrl, media.uri, media.mimeType);
    } else {
      await sendInParts(conversationId, ticket, media, as);
    }
  } catch (error) {
    throw toMessageMediaError(error);
  }

  // Le message média = le même descripteur + la clé objet rendue par le ticket. Le cast couvre
  // la fusion de l'union discriminée, que TS ne sait pas prouver.
  const sendInput = {
    ...uploadInput,
    storagePath: ticket.storagePath,
    ...extra,
  } as SendMessageInput;
  return messageApi.sendMessage(conversationId, sendInput, as);
}

/**
 * Envoi découpé : les parts, puis la clôture qui les recolle. Tant qu'elle n'a pas eu lieu, rien
 * n'existe dans le bucket — le message porterait un chemin vide.
 *
 * La boucle, le réessai et l'abandon vivent dans `runMultipartUpload` (`@cmv/shared`) : ce qui
 * était écrit quatre fois — débrief et messagerie, web et mobile — l'est désormais une seule.
 *
 * `onProgress` est `null` et pas un rappel vide : le fil mobile n'affiche AUCUN indicateur chiffré,
 * seulement une désactivation. C'est la dette U-3, et l'écrire ici la rend visible.
 */
function sendInParts(
  conversationId: string,
  ticket: MultipartUploadTicket,
  media: PreparedMessageMedia,
  as: TrainingCapability | null,
): Promise<void> {
  const upload = { storagePath: ticket.storagePath, uploadId: ticket.uploadId };
  return runMultipartUpload(ticket, storageFileSize(media.uri), {
    sendPart: (part, onSentBytes) => sendStoragePart(media.uri, part, onSentBytes),
    failureOf: storagePartFailure,
    complete: (partCount) =>
      messageApi.completeMediaUpload(conversationId, { ...upload, partCount }, as),
    abort: () => messageApi.abortMediaUpload(conversationId, upload, as),
    onProgress: null,
    onRetry: null,
  });
}

/**
 * Le transport est neutre (cf. `shared/lib/upload.ts`) : c'est ici que ses deux échecs prennent
 * les libellés de la MESSAGERIE. Les distinguer n'est pas cosmétique — « vérifie ta connexion »
 * sur une signature invalide envoie chercher la panne au mauvais endroit.
 */
function toMessageMediaError(error: unknown): unknown {
  if (error instanceof StorageUploadError) {
    return new MediaRejectedError(
      error.reason === "unreachable"
        ? "messages.media.storageUnreachable"
        : "messages.media.storageRejected",
    );
  }
  return error;
}

/**
 * Ouvre la galerie sur une sélection MULTIPLE (#156). `selectionLimit` n'est pas le garde-fou — il
 * est ignoré sur Android avant 13 — c'est `maxItems` côté lot qui borne réellement.
 */
async function pickImagesOrVideos(): Promise<ImagePicker.ImagePickerAsset[]> {
  // Permission demandée au moment de l'usage, pas au lancement.
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new MediaRejectedError("messages.media.permission");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: MAX_MESSAGE_MEDIA_BATCH,
    quality: 1, // compression photo maîtrisée par nos soins (dimension + qualité)
  });
  return result.canceled ? [] : result.assets;
}

/**
 * Ouvre les fichiers de l'appareil sur les seuls PDF (#771).
 *
 * `expo-document-picker` et non le sélecteur d'`expo-file-system`, pourtant déjà là : sur Android,
 * celui-ci rend un `content://` dont le nom lu côté JS est l'identifiant du fournisseur
 * (`msf:1000038591`), sans extension. Le PDF partait sous ce nom, et le lecteur du destinataire
 * ne savait plus ce qu'il ouvrait. Celui-ci rend le nom affiché et le type, et copie le fichier
 * dans le cache de l'app : l'envoi lit un `file://` ordinaire. Cette copie est effacée à la fin du
 * lot (`discardPickedFile`) — elle resterait sinon à l'appareil du compte suivant.
 */
async function pickFiles(): Promise<DocumentPicker.DocumentPickerAsset[]> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [...MESSAGE_FILE_MIME_TYPES],
    multiple: true,
  });
  return picked.canceled ? [] : picked.assets;
}
