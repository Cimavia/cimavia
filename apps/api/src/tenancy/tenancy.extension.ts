import { type CapabilityName, required } from "@cmv/shared";
import type { PrismaClient } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { TENANT_CLS_KEY, type TenantContext } from "./tenant-context.type";
import {
  type CapabilityScope,
  type OperationKind,
  operationKindOf,
  ownerColumnOrThrow,
  type ParentLink,
  parentIdsOrThrow,
  scopeFor,
  TENANT_SCOPES,
  type TenantFilter,
} from "./tenant-scope";

type ResolvedScope = {
  scope: CapabilityScope;
  kind: OperationKind;
  actorId: string;
  exercised: CapabilityName | null;
};

type Row = Record<string, unknown>;

/**
 * La transaction en cours, que Prisma passe à l'extension par un paramètre INTERNE, absent de ses
 * types (`__internalParams`) — seul moyen de lire le parent dans la transaction qui vient de le
 * créer (dette MC-3). Une montée de Prisma qui le retirerait ferait lire hors transaction : le parent
 * encore non validé y est invisible, la création est refusée, et les e2e tombent.
 */
type PrismaTransaction = { kind: string };
type InternalParams = { __internalParams?: { transaction?: PrismaTransaction } };

/** Une lecture du client de base, rattachée à la transaction en cours par `requestTransaction`. */
type ParentRead = PromiseLike<Row[]> & {
  requestTransaction(transaction: PrismaTransaction): PromiseLike<Row[]>;
};
type ParentDelegate = { findMany(args: unknown): ParentRead };

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
  return { scope, kind, actorId: actor.userId, exercised: actor.exercised };
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
  const where: Record<string, unknown> = { ...a.where };
  const added: unknown[] = [];
  for (const [key, value] of Object.entries(filter)) {
    // Un filtre composé (#605), ou une clé que l'appelant pose aussi — la relation d'un enfant
    // filtré à travers sa racine (`{ session: … }`) : il s'AJOUTE aux conditions de l'appelant.
    // Posé à plat, il remplacerait la sienne, et un `deleteMany` visant une séance viserait
    // toutes celles que l'acteur peut écrire.
    if (key === "AND") added.push(...asList(value));
    else if (key in where) added.push({ [key]: value });
    else where[key] = value;
  }
  if (added.length > 0) where.AND = [...asList(where.AND), ...added];
  a.where = where;
}

function asList(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Création : le tenant est INJECTÉ dans les données — l'appelant ne le fournit jamais, et ce qu'il
// glisserait est écrasé. `createMany` reçoit un tableau, `create` un objet ; les e2e couvrent les
// deux formes.
function scopeData(args: unknown, ownerOf: (row: Row) => TenantFilter): void {
  const a = args as { data: Row | Row[] };
  a.data = Array.isArray(a.data)
    ? a.data.map((row) => ({ ...row, ...ownerOf(row) }))
    : { ...a.data, ...ownerOf(a.data) };
}

/**
 * Le propriétaire de chaque parent, lu avec le filtre d'ÉCRITURE de la capacité exercée (#603) :
 * un parent introuvable, ou que l'acteur ne fait que lire (#605), fait refuser TOUTE la création.
 *
 * Par le client de base, avec le filtre posé à la main : le client tenant ne s'atteint pas d'ici.
 * Dans la transaction en cours quand il y en a une — sinon le parent qu'elle vient de créer serait
 * invisible. Une transaction en tableau n'y est pas admise : y glisser une lecture décalerait ses
 * résultats, et aucun service ne crée d'enfant de cette façon.
 */
async function parentOwnersOrThrow(
  prisma: PrismaClient,
  parent: ParentLink,
  child: { model: string; ids: string[] },
  actor: { actorId: string; exercised: CapabilityName | null },
  transaction: PrismaTransaction | undefined,
): Promise<Map<unknown, unknown>> {
  if (transaction != null && transaction.kind !== "itx") {
    throw new Error(`[tenancy] ${child.model} ne se crée pas dans une transaction en tableau`);
  }
  const registered = TENANT_SCOPES[parent.model];
  const parentScope = required(
    registered && scopeFor(registered, actor.exercised),
    // Stryker disable next-line StringLiteral: invariant du registre, qu'aucune requête n'atteint
    `[tenancy] ${parent.model}, parent de ${child.model}, n'a pas de scope pour cette capacité`,
  );
  const column = ownerColumnOrThrow(parentScope, parent.model);
  const delegateName = parent.model.charAt(0).toLowerCase() + parent.model.slice(1);
  const delegate = required(
    (prisma as unknown as Record<string, ParentDelegate | undefined>)[delegateName],
    // Stryker disable next-line StringLiteral: invariant du registre, qu'aucune requête n'atteint
    `[tenancy] ${parent.model}, parent de ${child.model}, n'est pas un modèle Prisma`,
  );

  const read = delegate.findMany({
    where: { id: { in: child.ids }, ...parentScope.where(actor.actorId, "write") },
    select: { id: true, [column]: true },
  });
  const parents = await (transaction == null ? read : read.requestTransaction(transaction));
  if (parents.length !== child.ids.length) {
    throw new Error(
      `[tenancy] ${child.model} : son ${parent.model} est introuvable, ou fermé en écriture`,
    );
  }
  return new Map(parents.map((row) => [row.id, row[column]]));
}

/**
 * Création : l'acteur dans la colonne du scope, ou — pour un enfant partageable — le propriétaire
 * de son parent (piège n°7). Une ligne sans parent optionnel (facture hors planification) prend
 * l'acteur.
 */
async function scopeCreation(
  prisma: PrismaClient,
  args: unknown,
  model: string,
  resolved: ResolvedScope,
  transaction: PrismaTransaction | undefined,
): Promise<void> {
  const { scope, actorId } = resolved;
  const column = ownerColumnOrThrow(scope, model);
  const parent = scope.parent;
  if (parent == null) {
    scopeData(args, () => ({ [column]: actorId }));
    return;
  }

  const data = (args as { data: Row | Row[] }).data;
  const ids = parentIdsOrThrow(Array.isArray(data) ? data : [data], parent, model);
  const owners = await parentOwnersOrThrow(prisma, parent, { model, ids }, resolved, transaction);
  scopeData(args, (row) => {
    const parentId = row[parent.key];
    return { [column]: parentId == null ? actorId : owners.get(parentId) };
  });
}

/**
 * Prisma Client Extension appliquant le scope tenant à TOUTE requête métier.
 * L'acteur courant est lu dans le CLS (peuplé par TenancyInterceptor). Aucune query ne
 * s'exécute hors scope : toute opération ciblée filtrée par le `where` de sa classe (#603),
 * création avec le champ tenant injecté — celui de l'acteur, ou celui du parent.
 */
export function createTenantPrisma(prisma: PrismaClient, cls: ClsService) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations(params) {
          const { model, operation, args, query } = params;
          const actor = cls.get<TenantContext | undefined>(TENANT_CLS_KEY);
          const resolved = resolveScopeOrThrow(model, operation, actor);

          if (resolved.kind.creates) {
            const { transaction } = (params as InternalParams).__internalParams ?? {};
            await scopeCreation(prisma, args, model, resolved, transaction);
          } else {
            scopeWhere(args, resolved.scope.where(resolved.actorId, resolved.kind.operationClass));
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
