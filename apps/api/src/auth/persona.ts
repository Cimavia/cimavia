import { type Capabilities, Role } from "@cmv/shared";

/**
 * Le persona d'AFFICHAGE d'un compte — où il atterrit (#9). Il se DÉDUIT des capacités, jamais il
 * ne se reçoit (#12), et ne fonde aucun droit.
 *
 * Une seule dérivation pour l'inscription et pour `PATCH /me/capabilities` : écrite deux fois, elle
 * avait déjà deux copies du même ternaire, et la troisième capacité (#600) n'en aurait corrigé
 * qu'une.
 *
 * L'entreprise d'abord : elle est exclusive. Coach l'emporte ensuite sur athlète quand les deux sont
 * cochées — c'est l'univers où l'on crée, et le cas qui a motivé #7 est un coach qui se coache.
 */
export function personaOf(capabilities: Capabilities): Role {
  if (capabilities.isCompany) return Role.COMPANY;
  return capabilities.isCoach ? Role.COACH : Role.ATHLETE;
}
