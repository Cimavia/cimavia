import { DocumentType, type DocumentUsage, type ExerciseDocumentDto, required } from "@cmv/shared";
import type { StorageService } from "./storage.service";

/**
 * Forme commune à un document de la bibliothèque (`ExerciseDocument`) et à sa COPIE posée dans
 * une planification (`ScheduledSessionExerciseDocument`) : les deux partagent la même clé objet
 * et se lisent de la même façon. Typé structurellement pour servir les deux sans duplication.
 */
export type DocumentRow = {
  id: string;
  type: DocumentType;
  usage: DocumentUsage;
  storagePath: string | null;
  url: string | null;
  fileName: string | null;
  mimeType: string | null;
  createdAt: Date;
};

/**
 * Mappe un document vers son DTO de sortie.
 * FILE  → `url` = URL GET signée courte sur l'objet privé (régénérée à chaque lecture).
 * LINK  → `url` = lien externe stocké tel quel.
 * L'invariant type↔champs est garanti à la création (union discriminée) ; on lève plutôt
 * que de retomber silencieusement sur une valeur par défaut (règle dure n°5).
 */
export async function toDocumentDto(
  doc: DocumentRow,
  storage: StorageService,
): Promise<ExerciseDocumentDto> {
  const url =
    doc.type === DocumentType.FILE
      ? await storage.createDownloadUrl(
          required(doc.storagePath, `[storage] document FILE ${doc.id} sans storagePath`),
        )
      : required(doc.url, `[storage] document LINK ${doc.id} sans url`);

  return {
    id: doc.id,
    type: doc.type,
    usage: doc.usage,
    url,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt.toISOString(),
  };
}
