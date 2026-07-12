import { randomUUID } from "node:crypto";
import {
  type AttachDocumentInput,
  DocumentType,
  type ExerciseDocumentDto,
  type RequestUploadUrlInput,
  type UploadUrlDto,
} from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Exercise, Prisma } from "@prisma/client";
import { SIGNED_URL_TTL_SECONDS, StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toExerciseDocumentDto } from "../exercise-document.mapper";

@Injectable()
export class ExerciseDocumentService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
  ) {}

  // Confirme que l'exercice appartient au coach courant (scope coachId), sinon 404.
  private async getOwnedExercise(exerciseId: string): Promise<Exercise> {
    const exercise = await this.db.exercise.findFirst({ where: { id: exerciseId } });
    if (exercise == null) {
      throw new NotFoundException("Exercice introuvable");
    }
    return exercise;
  }

  // Étape 1 : URL PUT signée pour uploader un fichier directement vers l'object storage.
  // Type MIME et taille max sont validés en amont par `requestUploadUrlSchema` (@cmv/shared,
  // pipe global) → une entrée non conforme n'atteint jamais ce service (400).
  async createUploadUrl(exerciseId: string, input: RequestUploadUrlInput): Promise<UploadUrlDto> {
    const exercise = await this.getOwnedExercise(exerciseId);
    const storagePath = buildDocumentKey(exercise.coachId, exerciseId, input.fileName);
    const uploadUrl = await this.storage.createUploadUrl(storagePath, input.mimeType);
    return { uploadUrl, storagePath, expiresIn: SIGNED_URL_TTL_SECONDS };
  }

  // Étape 2 : rattacher le document (après upload pour un FILE, ou lien externe pour un LINK).
  async attach(exerciseId: string, input: AttachDocumentInput): Promise<ExerciseDocumentDto> {
    await this.getOwnedExercise(exerciseId);
    // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast final.
    const data: Omit<Prisma.ExerciseDocumentUncheckedCreateInput, "coachId"> =
      input.type === DocumentType.FILE
        ? {
            exerciseId,
            type: DocumentType.FILE,
            storagePath: input.storagePath,
            fileName: input.fileName,
            mimeType: input.mimeType,
          }
        : { exerciseId, type: DocumentType.LINK, url: input.url };

    const doc = await this.db.exerciseDocument.create({
      data: data as Prisma.ExerciseDocumentUncheckedCreateInput,
    });
    return toExerciseDocumentDto(doc, this.storage);
  }

  async remove(exerciseId: string, documentId: string): Promise<void> {
    const doc = await this.db.exerciseDocument.findFirst({
      where: { id: documentId, exerciseId },
    });
    if (doc == null) {
      throw new NotFoundException("Document introuvable");
    }
    // Supprime d'abord l'objet S3 (FILE) puis la ligne : un objet orphelin coûte, une ligne
    // orpheline casse l'affichage. En cas d'échec S3, on n'efface pas la référence.
    if (doc.type === DocumentType.FILE && doc.storagePath != null) {
      await this.storage.deleteObject(doc.storagePath);
    }
    await this.db.exerciseDocument.delete({ where: { id: documentId } });
  }
}

// Clé objet : segmentée par coach puis exercice, préfixe UUID pour éviter les collisions
// de noms. Le nom de fichier est assaini (caractères sûrs uniquement).
function buildDocumentKey(coachId: string, exerciseId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.-]+/g, "_");
  return `coach/${coachId}/exercises/${exerciseId}/${randomUUID()}-${safeName}`;
}
