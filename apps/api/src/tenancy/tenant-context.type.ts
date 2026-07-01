import type { RoleType } from "@cmv/shared";

// Clé du store CLS portant l'acteur courant (résolu depuis la session Better Auth).
export const TENANT_CLS_KEY = "tenant";

// Acteur courant : ce que le Prisma Client Extension lit pour scoper chaque requête.
export type TenantContext = {
  userId: string;
  role: RoleType;
};
