import { DocumentType } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { DocumentRow } from "../../infra/storage/document.mapper";
import { citedStorageKeys } from "../../infra/storage/object-citations";
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
    @InjectPinoLogger(DocumentCleanupService.name) private readonly logger: PinoLogger,
  ) {}

  async deleteObjectIfUnreferenced(
    doc: Pick<DocumentRow, "id" | "type" | "storagePath">,
  ): Promise<void> {
    if (doc.type !== DocumentType.FILE || doc.storagePath == null) return;

    const cited = await citedStorageKeys(this.prisma, [doc.storagePath], doc.id);
    if (cited.size > 0) return;

    await this.storage.deleteObject(doc.storagePath);
  }

  /**
   * Les objets de documents dont les lignes viennent de partir (#330), purgés s'ils ne servent plus
   * — sans faire échouer l'appelant : son écriture est faite. Un échec se journalise et laisse
   * l'objet orphelin, la dette P2-1.
   *
   * Un seul décompte pour toutes les clés, les suppressions en parallèle : la réponse les attend.
   * Aucun document à excepter du décompte, leurs lignes sont déjà supprimées.
   */
  async purgeUnreferencedObjectsSafely(
    docs: readonly Pick<DocumentRow, "id" | "type" | "storagePath">[],
  ): Promise<void> {
    const files = docs.flatMap((doc) =>
      doc.type === DocumentType.FILE && doc.storagePath != null
        ? [{ id: doc.id, key: doc.storagePath }]
        : [],
    );
    if (files.length === 0) return;
    try {
      const cited = await citedStorageKeys(
        this.prisma,
        files.map((file) => file.key),
      );
      const purged = files.filter((file) => !cited.has(file.key));
      const results = await Promise.allSettled(
        purged.map((file) => this.storage.deleteObject(file.key)),
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled") return;
        this.warn(result.reason, { documentId: purged[index]?.id });
      });
    } catch (err) {
      this.warn(err, { documentIds: files.map((file) => file.id) });
    }
  }

  /**
   * Le nom de l'erreur, jamais l'erreur entière : le SDK S3 recopie sur l'exception les champs de la
   * réponse — `Key`, `Resource` —, et une clé porte le nom du fichier, qui n'a rien à faire dans les
   * logs.
   */
  private warn(err: unknown, context: Record<string, unknown>): void {
    const reason = err instanceof Error ? err.name : typeof err;
    this.logger.warn({ ...context, reason }, "document retiré : objet laissé en storage");
  }
}
