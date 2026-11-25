import { ProblemType } from "@cmv/shared";
import { HttpStatus } from "@nestjs/common";
import { ProblemException } from "../problem/problem.exception";

/**
 * Le 409 d'une écriture dans l'archive d'un suivi terminé (#909) : le lien du couple est rompu, ce
 * qu'il a produit se relit et ne s'écrit plus. Un 409 et non un 403 : ce n'est pas le droit de
 * l'acteur qui manque, c'est l'état du suivi — et le client dit « suivi terminé », pas « lecture
 * seule » (`ProblemType.FOLLOW_ENDED`).
 *
 * Levé par le service AVANT d'écrire : le scope tenant ferme déjà l'écriture, mais il la refuserait
 * par un 500 (enfant créé sous un parent fermé) ou par une écriture qui ne touche rien.
 */
export class FollowEndedException extends ProblemException {
  constructor() {
    super(HttpStatus.CONFLICT, ProblemType.FOLLOW_ENDED, "Ce suivi est terminé");
  }
}

/** Refuse l'écriture si le suivi a pris fin ; `null` dit qu'il continue. */
export function assertFollowOngoing(followEndedAt: Date | null): void {
  if (followEndedAt != null) throw new FollowEndedException();
}
