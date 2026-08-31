import type { Capabilities, CapabilityName } from "@cmv/shared";
import type { ClsService } from "nestjs-cls";

// Clé du store CLS portant l'acteur courant (résolu depuis la session Better Auth).
export const TENANT_CLS_KEY = "tenant";

/**
 * Acteur courant : ce que le Prisma Client Extension lit pour scoper chaque requête.
 *
 * `capabilities` dit ce que le compte PEUT faire ; `exercised` dit ce que la route courante fait
 * **à ce titre-là** — la capacité déclarée par `@RequireCapability`. Les deux sont nécessaires et
 * ne se déduisent pas l'une de l'autre : un compte à double capacité peut ouvrir `GET /invoices`
 * en tant que coach comme en tant qu'athlète, et c'est `exercised` qui départage la colonne de
 * scope (`coachId` ou `athleteId`).
 *
 * `exercised` vaut `null` sur une route qui n'exerce aucune capacité — c'est le cas voulu des
 * ressources au scope identique pour les deux (`Notification`, `PushToken`), pas un oubli.
 */
export type TenantContext = {
  userId: string;
  capabilities: Capabilities;
  exercised: CapabilityName | null;
};

/**
 * `role` n'est PAS ici, et son absence est le verrou : depuis #10, plus rien côté API ne dérive un
 * droit ni un scope du persona. Le rendre indisponible dans le contexte rend la règle exécutable
 * plutôt que déclarative — un service qui voudrait y revenir ne compile pas. Même geste que
 * `CapabilitySource` côté client (#9).
 */

/**
 * Lit l'acteur courant depuis le CLS — l'id et les capacités dont un service a besoin quand la
 * donnée elle-même ne les porte pas (auteur d'un message, résolution de la contrepartie d'un fil).
 * Même source que le Prisma Client Extension : l'absence signale un appel hors contexte tenant
 * (bug), pas un cas métier — on lève.
 */
export function currentActor(cls: ClsService): TenantContext {
  const actor = cls.get<TenantContext | undefined>(TENANT_CLS_KEY);
  if (actor == null) {
    throw new Error("[tenancy] acteur courant absent — appel hors contexte tenant");
  }
  return actor;
}

/**
 * La capacité exercée, ou une erreur. Pour les services qui BRANCHENT dessus — résoudre la
 * contrepartie d'un fil, choisir le destinataire d'une notification : répondre « athlète » parce
 * que ce n'est pas « coach » serait exactement le fallback que la règle nullable interdit, et il
 * enverrait le message à la mauvaise personne.
 *
 * Un `null` ici ne peut signifier qu'une chose : la route a oublié son `@RequireCapability`. C'est
 * un bug de câblage, donc une erreur — pas un cas métier.
 */
export function exercisedOrThrow(actor: TenantContext): CapabilityName {
  if (actor.exercised == null) {
    throw new Error(
      "[tenancy] capacité exercée inconnue — la route déclare-t-elle @RequireCapability ?",
    );
  }
  return actor.exercised;
}
