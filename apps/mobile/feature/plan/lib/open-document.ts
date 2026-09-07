import { DocumentType, type ExerciseDocumentDto } from "@cmv/shared";
import * as Sharing from "expo-sharing";
import { Linking } from "react-native";
import { localDocumentUri } from "@/shared/lib/document-cache";

/**
 * Ouvre une pièce jointe de séance, depuis l'appareil quand elle y est (#95).
 *
 * POURQUOI passer par `expo-sharing` et non `Linking`. Un `file://` du sandbox n'est ouvrable par
 * AUCUNE autre application sur Android : `Linking.openURL` y lève `FileUriExposedException`, le
 * système exigeant un `content://` délivré par un FileProvider. `Sharing.shareAsync` est ce
 * passage — l'OS propose alors les lecteurs capables du type. C'est un « ouvrir avec », pas une
 * ouverture DANS cimavia comme le dessine la maquette : l'écart est consigné au journal.
 *
 * L'extension conservée à l'écriture du fichier sert ici : iOS déduit d'elle le type à ouvrir,
 * sans qu'on ait à tenir une table de correspondance UTI.
 */
export type OpenDocumentOutcome =
  /** Remis à l'OS ou au navigateur — ce qu'il en fait ne nous regarde plus. */
  | "opened"
  /** Rien sur l'appareil, et pas de réseau pour aller le chercher. Le seul cas à expliquer. */
  | "offline"
  /** Réseau présent, ouverture refusée : lien mort, URL signée périmée, aucun lecteur installé. */
  | "failed";

async function openRemotely(url: string, isOnline: boolean): Promise<OpenDocumentOutcome> {
  if (!isOnline) return "offline";
  try {
    await Linking.openURL(url);
    return "opened";
  } catch {
    return "failed";
  }
}

export async function openDocument(
  planId: string,
  document: ExerciseDocumentDto,
  isOnline: boolean,
): Promise<OpenDocumentOutcome> {
  // Un lien externe n'a jamais de copie locale : il vit chez son hôte, et sans réseau il n'y a
  // rien à ouvrir — pas même en théorie.
  if (document.type === DocumentType.LINK) return openRemotely(document.url, isOnline);

  const localUri = localDocumentUri(planId, document);
  if (localUri != null) {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(
          localUri,
          document.mimeType == null ? {} : { mimeType: document.mimeType },
        );
        return "opened";
      }
    } catch {
      // Partage indisponible ou refusé : l'URL signée reste une voie, si le réseau est là.
    }
  }

  return openRemotely(document.url, isOnline);
}
