import { STALE_WRITE } from "@cmv/shared";
import { ConflictException, NotFoundException } from "@nestjs/common";

/**
 * Le 409 d'une écriture fondée sur une version périmée (#440) : l'élément a changé depuis que
 * l'auteur l'a lu. Le corps porte le code `STALE_WRITE`, que les clients reconnaissent
 * (`isStaleWriteError`) pour garder la saisie et proposer de recharger.
 *
 * La garde elle-même est une écriture CONDITIONNELLE sur la version lue — `updateMany` filtré par
 * `updatedAt`, `count === 0` → cette exception — jamais une lecture suivie d'une écriture : entre
 * les deux, une autre écriture passerait.
 */
export class StaleWriteException extends ConflictException {
  constructor() {
    super(STALE_WRITE);
  }
}

/**
 * Conclut une écriture conditionnée sur la version lue (#604) : si elle n'a rien écrit, il reste à
 * dire pourquoi. Relu, l'élément a disparu → 404 ; il existe encore, c'est donc qu'il a changé →
 * 409. Jamais un 409 sur un élément supprimé : « Recharger » n'y trouverait rien.
 *
 * `exists` relit par le client TENANT, dans la transaction de l'écriture : l'élément d'un autre
 * Coach n'existe pas pour l'acteur et répond 404 — un 409 lui apprendrait qu'il existe.
 */
export async function assertWrittenAtVersion(
  count: number,
  exists: () => Promise<boolean>,
  notFoundMessage: string,
): Promise<void> {
  if (count > 0) return;
  if (await exists()) throw new StaleWriteException();
  throw new NotFoundException(notFoundMessage);
}

/**
 * Le raccourci de la garde, jamais la garde elle-même : une version DÉJÀ dépassée à la lecture
 * répond 409 avant que la saisie soit validée contre un état qu'elle n'a pas vu. Sans lui, une
 * image de consigne ou un exercice retiré par l'autre écriture donnerait un 400 « saisie invalide »
 * au lieu de proposer de recharger. L'écriture conditionnelle qui suit reste indispensable : entre
 * cette lecture et elle, une autre écriture peut passer.
 */
export function assertReadAtVersion(read: Date, expected: Date): void {
  if (read.getTime() !== expected.getTime()) throw new StaleWriteException();
}

/** Ce qu'il faut d'un délégué Prisma (scopé tenant) pour écrire sous une version. */
type VersionedDelegate<Data> = {
  updateMany(args: {
    where: { id: string; updatedAt: Date };
    data: Data & { updatedAt: Date };
  }): Promise<{ count: number }>;
  count(args: { where: { id: string } }): Promise<number>;
};

/**
 * L'écriture conditionnelle elle-même (#604) : écrit `data` si l'élément est encore à la version
 * lue, et fait avancer celle-ci — `updatedAt` posé à la main, l'écriture peut n'avoir aucun autre
 * champ à écrire (les tags d'un exercice, la composition d'une séance vivent ailleurs). Sinon 404
 * ou 409, selon `assertWrittenAtVersion`.
 *
 * Le délégué est celui de la TRANSACTION : ce qui suit l'écriture — tags, composition — tombe
 * avec elle si elle est refusée.
 */
export async function writeAtVersion<Data extends object>(
  delegate: VersionedDelegate<Data>,
  id: string,
  expected: Date,
  data: Data,
  notFoundMessage: string,
): Promise<void> {
  const { count } = await delegate.updateMany({
    where: { id, updatedAt: expected },
    data: { ...data, updatedAt: new Date() },
  });
  await assertWrittenAtVersion(
    count,
    async () => (await delegate.count({ where: { id } })) > 0,
    notFoundMessage,
  );
}
