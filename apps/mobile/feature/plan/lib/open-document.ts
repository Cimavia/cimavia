import { DocumentType, type ExerciseDocumentDto } from "@cmv/shared";
import type { QueryClient } from "@tanstack/react-query";
import { Linking } from "react-native";
import { usableSession } from "@/feature/plan/lib/usable-session";
import { localDocumentUri } from "@/shared/lib/document-cache";
import { type OpenFileOutcome, openLocalFile } from "@/shared/lib/open-file";

/**
 * Ouvre une pièce jointe de séance, depuis l'appareil quand elle y est (#95) — le geste lui-même,
 * `ACTION_VIEW` ou la feuille iOS, vit dans `openLocalFile`.
 */
export type OpenDocumentOutcome = OpenFileOutcome;

async function openRemotely(url: string, isOnline: boolean): Promise<OpenDocumentOutcome> {
  if (!isOnline) return "offline";
  try {
    await Linking.openURL(url);
    return "opened";
  } catch {
    return "failed";
  }
}

/**
 * L'URL d'un document de la séance, signée À L'INSTANT si celle du cache ne l'est plus (#307).
 *
 * `null` = rien d'ouvrable : séance impossible à recharger, ou document retiré par le coach
 * depuis. L'appelant ne doit PAS ouvrir — mieux vaut un message clair qu'une page d'erreur du
 * storage.
 */
export async function freshDocumentUrl(
  queryClient: QueryClient,
  sessionId: string,
  documentId: string,
): Promise<string | null> {
  try {
    const session = await usableSession(queryClient, sessionId);
    const documents = session.exercises.flatMap((exercise) => exercise.documents);
    return documents.find((document) => document.id === documentId)?.url ?? null;
  } catch {
    return null;
  }
}

export async function openDocument(
  planId: string,
  document: ExerciseDocumentDto,
  isOnline: boolean,
  freshUrl: () => Promise<string | null>,
): Promise<OpenDocumentOutcome> {
  // Un lien externe n'a jamais de copie locale : il vit chez son hôte, et sans réseau il n'y a
  // rien à ouvrir — pas même en théorie. Il n'est pas signé non plus : rien à rafraîchir.
  if (document.type === DocumentType.LINK) return openRemotely(document.url, isOnline);

  const localUri = localDocumentUri(planId, document);
  if (localUri != null && (await openLocalFile(localUri, document.mimeType))) return "opened";
  if (!isOnline) return "offline";

  // Pas sur l'appareil : l'URL du cache a pu expirer — séance ouverte depuis plus de cinq
  // minutes, démarrage à froid. L'ouvrir telle quelle menait au 403 du storage, en XML brut.
  const url = await freshUrl();
  return url == null ? "failed" : openRemotely(url, isOnline);
}
