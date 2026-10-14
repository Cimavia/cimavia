import { DocumentType } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { DocumentRow } from "../../infra/storage/document.mapper";
import { StorageService } from "../../infra/storage/storage.service";

/**
 * Suppression d'un objet en storage — sous condition.
 *
 * Une séance planifiée COPIE les documents de l'exercice, en partageant la **même clé objet**
 * (pas de duplication de binaire). Supprimer l'exercice de la bibliothèque ne doit donc pas
 * effacer le fichier tant qu'une planif l'affiche encore : le coach casserait le cycle déjà
 * diffusé à son athlète. On ne purge que si plus aucune copie ne pointe sur la clé.
 *
 * Une variante partage de même les images de consigne de son exercice source (#315) : les AUTRES
 * documents de bibliothèque qui portent la clé la retiennent aussi. « Autres » au sens de la ligne,
 * pas de l'exercice — chaque envoi a sa propre clé, deux documents d'un même exercice ne la
 * partagent jamais.
 *
 * Les références se comptent chez TOUS les Coachs (piège n°8, #605), par le client de base : la
 * planification de M peut recopier un document de C, sous la clé de C. Comptée dans le seul scope
 * de C, elle ne retiendrait rien, et l'athlète de M perdrait son média. Sûr parce que la clé vient
 * d'un document que l'appelant a lu par une requête scopée, et que seul un décompte en sort.
 *
 * Contrepartie assumée : si la dernière copie disparaît plus tard, l'objet reste orphelin en
 * storage (cf. dette P2-1 — tâche de purge).
 */
@Injectable()
export class DocumentCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async deleteObjectIfUnreferenced(
    doc: Pick<DocumentRow, "id" | "type" | "storagePath">,
  ): Promise<void> {
    if (doc.type !== DocumentType.FILE || doc.storagePath == null) return;

    const [copies, siblings] = await Promise.all([
      this.prisma.scheduledSessionExerciseDocument.count({
        where: { storagePath: doc.storagePath },
      }),
      this.prisma.exerciseDocument.count({
        where: { storagePath: doc.storagePath, id: { not: doc.id } },
      }),
    ]);
    if (copies + siblings > 0) return;

    await this.storage.deleteObject(doc.storagePath);
  }
}
