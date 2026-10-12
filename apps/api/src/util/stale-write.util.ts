import { STALE_WRITE } from "@cmv/shared";
import { ConflictException } from "@nestjs/common";

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
