import { STALE_WRITE } from "@cmv/shared";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { isUniqueViolation } from "../infra/prisma/prisma-error";

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

/** Ce qu'il faut d'un délégué Prisma (scopé tenant) pour supprimer sous une version. */
type VersionedDeleteDelegate = {
  deleteMany(args: { where: { id: string; updatedAt: Date } }): Promise<{ count: number }>;
  count(args: { where: { id: string } }): Promise<number>;
};

/**
 * La suppression conditionnelle (#604) : supprime l'élément s'il est encore à la version lue, sinon
 * 404 ou 409 comme une écriture. Ce qui part en cascade a pu changer depuis la lecture — c'est
 * justement ce que la version garde.
 */
export async function deleteAtVersion(
  delegate: VersionedDeleteDelegate,
  id: string,
  expected: Date,
  notFoundMessage: string,
): Promise<void> {
  const { count } = await delegate.deleteMany({ where: { id, updatedAt: expected } });
  await assertWrittenAtVersion(
    count,
    async () => (await delegate.count({ where: { id } })) > 0,
    notFoundMessage,
  );
}

/**
 * Une CRÉATION ne cite pas de version (#604) : rien n'existe encore à avoir lu. Mais deux Coachs
 * qui ajoutent au même instant une semaine au même cycle visent le même numéro, et se heurtent sur
 * l'unicité, et le second a bien travaillé sur une grille périmée :
 * c'est le même 409, et « relire » lui montrera ce que l'autre a posé.
 *
 * Autour de la TRANSACTION entière, jamais dedans : Postgres l'a déjà annulée à la violation.
 */
export async function staleOnCollision<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new StaleWriteException();
    throw error;
  }
}
