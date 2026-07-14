import { DocumentType } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { DocumentRow } from "../../infra/storage/document.mapper";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";

/**
 * Suppression d'un objet en storage — sous condition.
 *
 * Une séance planifiée COPIE les documents de l'exercice, en partageant la **même clé objet**
 * (pas de duplication de binaire). Supprimer l'exercice de la bibliothèque ne doit donc pas
 * effacer le fichier tant qu'une planif l'affiche encore : le coach casserait le cycle déjà
 * diffusé à son athlète. On ne purge que si plus aucune copie ne pointe sur la clé.
 *
 * Contrepartie assumée : si la dernière copie disparaît plus tard, l'objet reste orphelin en
 * storage (cf. dette P2-1 — tâche de purge).
 */
@Injectable()
export class DocumentCleanupService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
  ) {}

  async deleteObjectIfUnreferenced(doc: Pick<DocumentRow, "type" | "storagePath">): Promise<void> {
    if (doc.type !== DocumentType.FILE || doc.storagePath == null) return;

    const copies = await this.db.scheduledSessionExerciseDocument.count({
      where: { storagePath: doc.storagePath },
    });
    if (copies > 0) return;

    await this.storage.deleteObject(doc.storagePath);
  }
}
