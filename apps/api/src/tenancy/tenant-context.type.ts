import type { RoleType } from "@cmv/shared";
import type { ClsService } from "nestjs-cls";

// Clé du store CLS portant l'acteur courant (résolu depuis la session Better Auth).
export const TENANT_CLS_KEY = "tenant";

// Acteur courant : ce que le Prisma Client Extension lit pour scoper chaque requête.
export type TenantContext = {
  userId: string;
  role: RoleType;
};

/**
 * Lit l'acteur courant depuis le CLS — l'id et le rôle dont un service a besoin quand la donnée
 * elle-même ne les porte pas (auteur d'un message, résolution de la contrepartie d'un fil). Même
 * source que le Prisma Client Extension : l'absence signale un appel hors contexte tenant (bug),
 * pas un cas métier — on lève.
 */
export function currentActor(cls: ClsService): TenantContext {
  const actor = cls.get<TenantContext | undefined>(TENANT_CLS_KEY);
  if (actor == null) {
    throw new Error("[tenancy] acteur courant absent — appel hors contexte tenant");
  }
  return actor;
}
