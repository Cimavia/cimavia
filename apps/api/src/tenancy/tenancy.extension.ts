import { Role } from "@cmv/shared";
import type { PrismaClient } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { TENANT_CLS_KEY, type TenantContext } from "./tenant-context.type";

/**
 * Registre du scope tenant par modèle métier : champ portant le coach et/ou l'athlète
 * propriétaire. Un modèle ABSENT d'ici est **refusé** via le client tenant (fail closed) —
 * ce qui force à rattacher explicitement toute nouvelle entité au tenant (règle dure).
 */
const TENANT_SCOPES: Record<string, { coach?: string; athlete?: string }> = {
  CoachAthlete: { coach: "coachId", athlete: "athleteId" },
  Invitation: { coach: "coachId" },
  AthleteSheet: { coach: "coachId", athlete: "athleteId" },
};

// Champ de scope applicable à l'acteur, ou null si le rôle n'a aucun accès à ce modèle.
function tenantField(model: string, role: string): string | null {
  const scope = TENANT_SCOPES[model];
  if (!scope) return null;
  if (role === Role.COACH) return scope.coach ?? null;
  if (role === Role.ATHLETE) return scope.athlete ?? null;
  return null; // ADMIN & autres : aucun scope auto en P1 (pas de flux back-office)
}

const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

type FindFirstDelegate = {
  findFirst: (args: unknown) => Promise<unknown>;
  findFirstOrThrow: (args: unknown) => Promise<unknown>;
};

/**
 * Prisma Client Extension appliquant le scope tenant à TOUTE requête métier.
 * L'acteur courant est lu dans le CLS (peuplé par TenancyInterceptor). Aucune query ne
 * s'exécute hors scope : lecture filtrée par `where`, écriture avec le champ tenant injecté.
 */
export function createTenantPrisma(prisma: PrismaClient, cls: ClsService) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const actor = cls.get<TenantContext | undefined>(TENANT_CLS_KEY);
          if (!actor) {
            throw new Error(
              `[tenancy] acteur courant absent — ${model}.${operation} exécuté hors contexte tenant`,
            );
          }
          if (!(model in TENANT_SCOPES)) {
            throw new Error(
              `[tenancy] modèle non scopé : ${model} — rattacher au tenant avant usage`,
            );
          }
          const field = tenantField(model, actor.role);
          if (!field) {
            throw new Error(`[tenancy] rôle ${actor.role} non autorisé sur ${model}`);
          }
          const filter = { [field]: actor.userId };

          switch (operation) {
            // findUnique n'accepte que des clés uniques dans `where` → bascule en findFirst
            // pour pouvoir AND le filtre tenant sans que Prisma rejette l'argument.
            case "findUnique":
            case "findUniqueOrThrow": {
              const method = operation === "findUnique" ? "findFirst" : "findFirstOrThrow";
              const delegates = prisma as unknown as Record<string, FindFirstDelegate | undefined>;
              const delegate = delegates[delegateName(model)];
              if (!delegate) {
                throw new Error(`[tenancy] délégué Prisma introuvable pour ${model}`);
              }
              const a = args as { where?: Record<string, unknown> };
              return delegate[method]({ ...a, where: { ...a.where, ...filter } });
            }
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
            case "update":
            case "updateMany":
            case "delete":
            case "deleteMany": {
              const a = args as { where?: Record<string, unknown> };
              a.where = { ...a.where, ...filter };
              return query(args);
            }
            case "create": {
              const a = args as { data?: Record<string, unknown> };
              a.data = { ...a.data, ...filter };
              return query(args);
            }
            case "createMany":
            case "createManyAndReturn": {
              const a = args as { data?: Record<string, unknown> | Record<string, unknown>[] };
              a.data = Array.isArray(a.data)
                ? a.data.map((d) => ({ ...d, ...filter }))
                : { ...a.data, ...filter };
              return query(args);
            }
            default:
              // upsert & opérations exotiques : interdites via le client tenant en P1
              // (leur `where`/`create` unique créerait un angle mort de scope).
              throw new Error(`[tenancy] opération non gérée : ${operation} sur ${model}`);
          }
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof createTenantPrisma>;
