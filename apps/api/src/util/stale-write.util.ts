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
