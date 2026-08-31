import type { CapabilityName } from "@cmv/shared";
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
  Exercise: { coach: "coachId" },
  ExerciseDocument: { coach: "coachId" },
  ExerciseTag: { coach: "coachId" },
  CustomMetric: { coach: "coachId" },
  Session: { coach: "coachId" },
  SessionExercise: { coach: "coachId" },
  Plan: { coach: "coachId", athlete: "athleteId" },
  PlanWeek: { coach: "coachId", athlete: "athleteId" },
  ScheduledSession: { coach: "coachId", athlete: "athleteId" },
  ScheduledSessionExercise: { coach: "coachId", athlete: "athleteId" },
  ScheduledSessionExerciseDocument: { coach: "coachId", athlete: "athleteId" },
  ScheduledSessionExerciseTag: { coach: "coachId", athlete: "athleteId" },
  SessionFeedback: { coach: "coachId", athlete: "athleteId" },
  FeedbackMedia: { coach: "coachId", athlete: "athleteId" },
  Conversation: { coach: "coachId", athlete: "athleteId" },
  Message: { coach: "coachId", athlete: "athleteId" },
  Invoice: { coach: "coachId", athlete: "athleteId" },
  PushToken: { coach: "userId", athlete: "userId" },
  // Comme PushToken : le même champ pour les deux rôles, chacun ne lisant que ce qu'il a reçu.
  // L'ÉCRITURE vise le destinataire, donc un AUTRE tenant → hors de ce client (NotificationService).
  Notification: { coach: "recipientId", athlete: "recipientId" },
  /**
   * Rappels (#44) — le SEUL modèle métier sans scope athlète : c'est un outil privé du coach.
   * L'absence de clé `athlete` n'est donc pas un oubli, c'est la règle — un athlète qui atteindrait
   * ce modèle se verrait refusé par `tenantFilterOrThrow` (fail closed).
   *
   * Ce refus étant une ERREUR (500) et non un 403, deux gardes le précèdent :
   * `@RequireCapability("coach")` sur le contrôleur, et le branchement par rôle du centre de
   * notifications (#51), qui ne lit les rappels que pour un coach.
   */
  Reminder: { coach: "coachId" },
};

/**
 * Champ de scope applicable, ou `null` si la capacité exercée n'a aucun accès à ce modèle.
 *
 * Depuis #10, le champ se dérive de la capacité **exercée par la route** et non plus du rôle de
 * l'acteur — question qui n'avait plus de réponse dès qu'un compte porte les deux : `GET /invoices`
 * ne pouvait pas savoir s'il fallait montrer les factures émises ou reçues. La route le déclare
 * (`@RequireCapability`), l'interceptor le résout, on le lit ici.
 *
 * `exercised === null` (route qui n'exerce aucune capacité) n'est PAS un refus par défaut : c'est
 * le cas voulu de `Notification` et `PushToken`, dont le scope est le MÊME champ pour les deux
 * capacités. La condition l'exprime littéralement — un modèle dont les deux scopes coïncident n'a
 * pas besoin qu'on choisisse. Tout autre modèle atteint sans capacité déclarée est refusé, ce qui
 * transforme un oubli de décorateur en panne immédiate plutôt qu'en fuite de tenant.
 */
function tenantField(model: string, exercised: CapabilityName | null): string | null {
  const scope = TENANT_SCOPES[model];
  if (!scope) return null;
  if (exercised === "coach") return scope.coach ?? null;
  if (exercised === "athlete") return scope.athlete ?? null;
  return scope.coach != null && scope.coach === scope.athlete ? scope.coach : null;
}

const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

type FindFirstDelegate = {
  findFirst: (args: unknown) => Promise<unknown>;
  findFirstOrThrow: (args: unknown) => Promise<unknown>;
};

type TenantFilter = Record<string, unknown>;

/**
 * Le filtre tenant applicable à cette requête, ou une erreur explicite. Trois refus, dans cet
 * ordre : pas d'acteur (requête hors contexte), modèle absent de TENANT_SCOPES (oubli de
 * rattachement), capacité sans accès. Aucun n'est silencieux — un scope manquant doit casser
 * bruyamment plutôt que servir la donnée d'un autre tenant.
 */
function tenantFilterOrThrow(
  model: string,
  operation: string,
  actor: TenantContext | undefined,
): TenantFilter {
  if (!actor) {
    throw new Error(
      `[tenancy] acteur courant absent — ${model}.${operation} exécuté hors contexte tenant`,
    );
  }
  if (!(model in TENANT_SCOPES)) {
    throw new Error(`[tenancy] modèle non scopé : ${model} — rattacher au tenant avant usage`);
  }
  const field = tenantField(model, actor.exercised);
  if (!field) {
    throw new Error(
      `[tenancy] capacité ${actor.exercised ?? "(aucune déclarée)"} non autorisée sur ${model}`,
    );
  }
  return { [field]: actor.userId };
}

/**
 * findUnique n'accepte que des clés uniques dans `where` → bascule en findFirst pour pouvoir AND
 * le filtre tenant sans que Prisma rejette l'argument.
 */
function findUniqueScoped(
  prisma: PrismaClient,
  model: string,
  operation: string,
  args: unknown,
  filter: TenantFilter,
): Promise<unknown> {
  const method = operation === "findUnique" ? "findFirst" : "findFirstOrThrow";
  const delegates = prisma as unknown as Record<string, FindFirstDelegate | undefined>;
  const delegate = delegates[delegateName(model)];
  if (!delegate) {
    throw new Error(`[tenancy] délégué Prisma introuvable pour ${model}`);
  }
  const a = args as { where?: Record<string, unknown> };
  return delegate[method]({ ...a, where: { ...a.where, ...filter } });
}

// Lecture/écriture ciblée : le filtre s'ajoute au `where`.
function scopeWhere(args: unknown, filter: TenantFilter): void {
  const a = args as { where?: Record<string, unknown> };
  a.where = { ...a.where, ...filter };
}

// Création : le tenant est INJECTÉ dans les données — l'appelant ne le fournit jamais. `createMany`
// reçoit un tableau, `create` un objet ; le test couvre les deux formes.
function scopeData(args: unknown, filter: TenantFilter): void {
  const a = args as { data?: Record<string, unknown> | Record<string, unknown>[] };
  a.data = Array.isArray(a.data)
    ? a.data.map((item) => ({ ...item, ...filter }))
    : { ...a.data, ...filter };
}

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
          const filter = tenantFilterOrThrow(model, operation, actor);

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow":
              return findUniqueScoped(prisma, model, operation, args, filter);

            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
            case "update":
            case "updateMany":
            case "delete":
            case "deleteMany":
              scopeWhere(args, filter);
              return query(args);

            case "create":
            case "createMany":
            case "createManyAndReturn":
              scopeData(args, filter);
              return query(args);

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

/**
 * Client d'une transaction interactive (`db.$transaction(async (tx) => …)`). L'extension tenant
 * s'applique AUSSI à l'intérieur : `tx` scope donc comme `db`. Type dérivé du client plutôt que
 * réécrit dans chaque service — sinon la signature diverge au premier changement d'extension.
 */
export type TenantTx = Parameters<Parameters<TenantPrisma["$transaction"]>[0]>[0];
