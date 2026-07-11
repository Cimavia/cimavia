import { DocumentType, type ExerciseDocumentDto } from "@cmv/shared";
import type { ExerciseDocument } from "@prisma/client";
import type { StorageService } from "../infra/storage/storage.service";

/**
 * Mappe un document vers son DTO de sortie.
 * FILE  → `url` = URL GET signée courte sur l'objet privé (régénérée à chaque lecture).
 * LINK  → `url` = lien externe stocké tel quel.
 * L'invariant type↔champs est garanti à la création (union discriminée) ; on lève plutôt
 * que de retomber silencieusement sur une valeur par défaut (règle dure n°5).
 */
export async function toExerciseDocumentDto(
  doc: ExerciseDocument,
  storage: StorageService,
): Promise<ExerciseDocumentDto> {
  let url: string;
  if (doc.type === DocumentType.FILE) {
    if (doc.storagePath == null) {
      throw new Error(`[storage] document FILE ${doc.id} sans storagePath`);
    }
    url = await storage.createDownloadUrl(doc.storagePath);
  } else {
    if (doc.url == null) {
      throw new Error(`[storage] document LINK ${doc.id} sans url`);
    }
    url = doc.url;
  }

  return {
    id: doc.id,
    type: doc.type,
    url,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt.toISOString(),
  };
}
