import {
  type AttachDocumentInput,
  DocumentType,
  DocumentUsage,
  type ExerciseDocumentDto,
  type RequestUploadUrlInput,
  SIGNED_URL_TTL_SECONDS,
  type UploadUrlDto,
} from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { toDocumentDto } from "../../infra/storage/document.mapper";
import { assertKeyUnder, buildObjectKey } from "../../infra/storage/object-key";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { DocumentCleanupService } from "./document-cleanup.service";
import { ExerciseService } from "./exercise.service";

@Injectable()
export class ExerciseDocumentService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    // Le contrôle d'appartenance de l'exercice parent vit dans ExerciseService (source unique).
    private readonly exercises: ExerciseService,
    private readonly cleanup: DocumentCleanupService,
  ) {}

  // Étape 1 : URL PUT signée pour uploader un fichier directement vers l'object storage.
  // Type MIME et taille max sont validés en amont par `requestUploadUrlSchema` (@cmv/shared,
  // pipe global) → une entrée non conforme n'atteint jamais ce service (400). La taille entre
  // dans la signature : sans elle, le plafond n'était qu'une déclaration, et l'athlète
  // télécharge ces documents d'office (#95, #317).
  async createUploadUrl(exerciseId: string, input: RequestUploadUrlInput): Promise<UploadUrlDto> {
    const exercise = await this.exercises.getOwnedOrThrow(exerciseId);
    const storagePath = buildDocumentKey(exercise.coachId, exerciseId, input.fileName);
    const uploadUrl = await this.storage.createUploadUrl(
      storagePath,
      input.mimeType,
      SIGNED_URL_TTL_SECONDS,
      input.size,
    );
    return { uploadUrl, storagePath, expiresIn: SIGNED_URL_TTL_SECONDS };
  }

  // Étape 2 : rattacher le document (après upload pour un FILE, ou lien externe pour un LINK).
  async attach(exerciseId: string, input: AttachDocumentInput): Promise<ExerciseDocumentDto> {
    const exercise = await this.exercises.getOwnedOrThrow(exerciseId);
    // La clé vient du client : elle doit désigner un objet de CET exercice (#293). Sans quoi la
    // suppression du document — qui ne compte les copies que dans le scope du coach — purgerait
    // l'objet d'un autre tenant.
    // Puis l'objet doit être celui que le ticket a signé : le rattachement redit son type et sa
    // taille, le storage les confronte à ce qu'il a reçu (#317).
    if (input.type === DocumentType.FILE) {
      assertKeyUnder(documentKeyPrefix(exercise.coachId, exerciseId), input.storagePath);
      await this.storage.assertUploadedAsDeclared(input.storagePath, input);
    }
    // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast final.
    const data: Omit<Prisma.ExerciseDocumentUncheckedCreateInput, "coachId"> =
      input.type === DocumentType.FILE
        ? {
            exerciseId,
            type: DocumentType.FILE,
            storagePath: input.storagePath,
            fileName: input.fileName,
            mimeType: input.mimeType,
            // Un LINK est toujours une pièce jointe : le lien inline de la consigne est une
            // MARQUE sur du texte, pas un document rattaché.
            usage: input.usage ?? DocumentUsage.ATTACHMENT,
          }
        : { exerciseId, type: DocumentType.LINK, url: input.url };

    const doc = await this.db.exerciseDocument.create({
      data: data as Prisma.ExerciseDocumentUncheckedCreateInput,
    });
    return toDocumentDto(doc, this.storage);
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
    // L'objet est conservé s'il est encore affiché par une séance planifiée (copie du document).
    await this.cleanup.deleteObjectIfUnreferenced(doc);
    await this.db.exerciseDocument.delete({ where: { id: documentId } });
  }
}

// Segment commun à tous les documents d'un exercice, partagé par la construction de la clé et sa
// vérification au rattachement : deux littéraux divergeraient au premier changement.
function documentKeyPrefix(coachId: string, exerciseId: string): string {
  return `coach/${coachId}/exercises/${exerciseId}/`;
}

// Clé objet : segmentée par coach puis exercice (forme commune : `buildObjectKey`).
function buildDocumentKey(coachId: string, exerciseId: string, fileName: string): string {
  return buildObjectKey(documentKeyPrefix(coachId, exerciseId), fileName);
}
