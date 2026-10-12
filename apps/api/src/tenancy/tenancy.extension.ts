import type { PrismaClient } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { TENANT_CLS_KEY, type TenantContext } from "./tenant-context.type";
import {
  type CapabilityScope,
  creationDataOrThrow,
  type OperationKind,
  operationKindOf,
  scopeFor,
  TENANT_SCOPES,
  type TenantFilter,
} from "./tenant-scope";

type ResolvedScope = { scope: CapabilityScope; kind: OperationKind; actorId: string };

/**
 * Le scope applicable à cette requête et la classe de son opération, ou une erreur explicite.
 * Quatre refus, dans cet ordre : pas d'acteur (requête hors contexte), modèle absent de
 * TENANT_SCOPES (oubli de rattachement), capacité sans accès, opération non gérée (`upsert` et
 * les exotiques). Aucun n'est silencieux — un scope manquant doit casser bruyamment plutôt que
 * servir la donnée d'un autre tenant.
 */
function resolveScopeOrThrow(
  model: string,
  operation: string,
  actor: TenantContext | undefined,
): ResolvedScope {
  if (!actor) {
    throw new Error(
      `[tenancy] acteur courant absent — ${model}.${operation} exécuté hors contexte tenant`,
    );
  }
  const registered = TENANT_SCOPES[model];
  if (registered == null) {
    throw new Error(`[tenancy] modèle non scopé : ${model} — rattacher au tenant avant usage`);
  }
  const scope = scopeFor(registered, actor.exercised);
  if (!scope) {
    throw new Error(
      `[tenancy] capacité ${actor.exercised ?? "(aucune déclarée)"} non autorisée sur ${model}`,
    );
  }
  const kind = operationKindOf(registered, operation);
  if (!kind) {
    throw new Error(`[tenancy] opération non gérée : ${operation} sur ${model}`);
  }
  return { scope, kind, actorId: actor.userId };
}

/**
 * Lecture/écriture ciblée : le filtre s'ajoute au `where`. Un `where` unique (`findUnique`,
 * `update`, `delete`) l'accepte aussi : Prisma y admet des champs non uniques à côté de la clé.
 *
 * Prisma REGROUPE les `findUnique` d'un même tick en une requête — par modèle et forme
 * d'arguments, sans leurs valeurs, donc entre tenants — et rend à chacun sa ligne en comparant
 * TOUS les champs du `where`, filtre tenant compris. Un e2e tient ce tri (« Tranché en #626 ») :
 * il est ce qui sépare deux coachs lisant le même id.
 */
function scopeWhere(args: unknown, filter: TenantFilter): void {
  const a = args as { where?: Record<string, unknown> };
  a.where = { ...a.where, ...filter };
}

// Création : le tenant est INJECTÉ dans les données — l'appelant ne le fournit jamais. `createMany`
// reçoit un tableau, `create` un objet ; les e2e couvrent les deux formes.
function scopeData(args: unknown, owner: TenantFilter): void {
  const a = args as { data?: Record<string, unknown> | Record<string, unknown>[] };
  a.data = Array.isArray(a.data)
    ? a.data.map((item) => ({ ...item, ...owner }))
    : { ...a.data, ...owner };
}

/**
 * Prisma Client Extension appliquant le scope tenant à TOUTE requête métier.
 * L'acteur courant est lu dans le CLS (peuplé par TenancyInterceptor). Aucune query ne
 * s'exécute hors scope : toute opération ciblée filtrée par le `where` de sa classe (#603),
 * création avec le champ tenant injecté.
 */
export function createTenantPrisma(prisma: PrismaClient, cls: ClsService) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const actor = cls.get<TenantContext | undefined>(TENANT_CLS_KEY);
          const { scope, kind, actorId } = resolveScopeOrThrow(model, operation, actor);

          if (kind.creates) {
            scopeData(args, creationDataOrThrow(scope, model, actorId));
          } else {
            scopeWhere(args, scope.where(actorId, kind.operationClass));
          }
          return query(args);
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof createTenantPrisma>;

/**
 * Client d'une transaction interactive (`db.$transaction(async (tx) => …)`). L'extension tenant
 * s'applique AUSSI à l'intérieur : `tx` scope donc comme `db`. Type dérivé du client plutôt que
 * réécrit dans chaque service — sinon la signature diverge au premier changement d'extension.
 */
export type TenantTx = Parameters<Parameters<TenantPrisma["$transaction"]>[0]>[0];
