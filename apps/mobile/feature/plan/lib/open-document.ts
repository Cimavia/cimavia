import { DocumentType, type ExerciseDocumentDto } from "@cmv/shared";
import { File } from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";
import { localDocumentUri } from "@/shared/lib/document-cache";

/**
 * Ouvre une pièce jointe de séance, depuis l'appareil quand elle y est (#95).
 *
 * OUVRIR N'EST PAS PARTAGER. Un `file://` du sandbox n'est lisible par aucune autre application
 * sur Android — `Linking.openURL` y lève `FileUriExposedException`, le système exigeant un
 * `content://` délivré par un FileProvider. La première version passait donc par
 * `Sharing.shareAsync`, qui fournit bien ce `content://`… en ouvrant la feuille de PARTAGE : on
 * proposait à l'athlète d'envoyer son PDF à ses contacts au lieu de le lui montrer. Le geste juste
 * est l'intention `ACTION_VIEW`, à qui l'on tend le `contentUri` que le fichier expose déjà.
 *
 * iOS n'a pas d'équivalent : `UIActivityViewController` — donc `Sharing` — est la voie
 * documentée, et sa feuille porte un aperçu Quick Look en tête. L'asymétrie est assumée, faute de
 * mieux sans embarquer un visionneur.
 *
 * L'extension conservée à l'écriture du fichier sert des deux côtés : elle aide Android à trouver
 * un lecteur quand le type MIME manque, et iOS à déduire ce qu'il présente.
 */
export type OpenDocumentOutcome =
  /** Remis à l'OS ou au navigateur — ce qu'il en fait ne nous regarde plus. */
  | "opened"
  /** Rien sur l'appareil, et pas de réseau pour aller le chercher. Le seul cas à expliquer. */
  | "offline"
  /** Réseau présent, ouverture refusée : lien mort, url signée périmée, aucun lecteur installé. */
  | "failed";

// `FLAG_GRANT_READ_URI_PERMISSION` : sans lui, l'application qui reçoit le `content://` n'a pas le
// droit de le lire, et l'ouverture échoue APRÈS avoir affiché le sélecteur.
const FLAG_GRANT_READ_URI_PERMISSION = 1;

/** Le `content://` du fichier, `null` hors Android ou si le fichier ne peut pas en fournir. */
function contentUriOf(fileUri: string): string | null {
  try {
    const uri = new File(fileUri).contentUri;
    return uri === "" ? null : uri;
  } catch {
    return null;
  }
}

async function openOnAndroid(fileUri: string, mimeType: string | null): Promise<boolean> {
  const data = contentUriOf(fileUri);
  if (data == null) return false;
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      // Sans type, Android infère depuis l'extension — d'où l'intérêt de l'avoir conservée.
      ...(mimeType == null ? {} : { type: mimeType }),
    });
    return true;
  } catch {
    // Aucune application installée ne sait ouvrir ce type.
    return false;
  }
}

async function openOnIos(fileUri: string, mimeType: string | null): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(fileUri, mimeType == null ? {} : { mimeType });
    return true;
  } catch {
    return false;
  }
}

function openLocally(fileUri: string, mimeType: string | null): Promise<boolean> {
  return Platform.OS === "android"
    ? openOnAndroid(fileUri, mimeType)
    : openOnIos(fileUri, mimeType);
}

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
  if (localUri != null && (await openLocally(localUri, document.mimeType))) return "opened";

  return openRemotely(document.url, isOnline);
}
