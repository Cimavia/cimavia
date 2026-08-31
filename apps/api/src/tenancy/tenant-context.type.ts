import type { Capabilities, CapabilityName, RoleType } from "@cmv/shared";
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
  /**
   * Persona d'AFFICHAGE, conservé le temps de la bascule (#10) : `tenantField` et quatre services
   * le lisent encore. Il ne fonde aucun droit — les gardes lisent `capabilities`.
   */
  role: RoleType;
  capabilities: Capabilities;
  exercised: CapabilityName | null;
};

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
