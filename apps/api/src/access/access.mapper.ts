import {
  type AccessGrantDto,
  AccessLevel,
  type AccessOwner,
  type ChangeAccessInput,
  type CoachGrantDto,
  effectiveAccess,
  LibraryScope,
  type MyAccess,
  MyAccessLevel,
  required,
} from "@cmv/shared";
import type { Prisma } from "@prisma/client";

/** Ce qu'une ligne de droit dit de son bénéficiaire : une entreprise, ou un Coach (#608). */
export const GRANT_BENEFICIARY_SELECT = {
  level: true,
  organization: { select: { id: true, user: { select: { name: true } } } },
  coach: { select: { id: true, name: true } },
} satisfies Prisma.AccessGrantSelect;

/**
 * Ce qu'un exercice, une séance ou une planification (#607) doit charger pour dire qui le possède
 * et ce que l'acteur peut en faire (#605). Imbriqué, donc hors du scope de l'extension (piège
 * n°2) — c'est voulu : ce sont les droits de l'élément déjà prouvé lisible, et seul son
 * propriétaire les recevra tels quels.
 *
 * Toutes les lignes, celles des Coachs comprises (#608) : la ligne de l'acteur l'emporte sur ses
 * entreprises, et il faut la lire pour le savoir.
 */
export const ACCESS_INCLUDE = {
  coach: { select: { id: true, name: true } },
  accessGrants: { select: GRANT_BENEFICIARY_SELECT },
} satisfies Prisma.ExerciseInclude & Prisma.SessionInclude & Prisma.PlanInclude;

/**
 * Un élément partageable — exercice, séance ou planification —, chargé avec `ACCESS_INCLUDE`. Les
 * lignes `NONE` d'une planification (#607) y arrivent, et `toGrantDtos` les écarte : elles ne
 * disent qu'au droit par défaut de ne pas rouvrir l'entreprise.
 */
export type AccessRow = Pick<
  Prisma.ExerciseGetPayload<{ include: typeof ACCESS_INCLUDE }>,
  "id" | "coach" | "accessGrants"
>;

/** Qui agit, et dans quelles entreprises : de quoi dire son droit sur chaque élément lu. */
export type AccessContext = { actorId: string; organizationIds: ReadonlySet<string> };

/** Ce que le DTO d'un élément de la bibliothèque dit de ses accès. */
export type AccessView = {
  owner: AccessOwner;
  myAccess: MyAccess;
  /** Les droits accordés, pour le panneau du propriétaire ; `null` pour tout autre lecteur. */
  grants: AccessGrantDto[] | null;
  /** Ceux des Coachs (#608), pour le même panneau ; `null` pour tout autre lecteur. */
  coachGrants: CoachGrantDto[] | null;
};

type GrantRow = Pick<AccessRow["accessGrants"][number], "level" | "organization" | "coach">;

/** Les droits d'entreprise de l'élément, triés par nom : l'ordre du panneau. */
export function toGrantDtos(rows: readonly GrantRow[]): AccessGrantDto[] {
  return rows
    .flatMap(({ level, organization }) =>
      organization == null || level === AccessLevel.NONE
        ? []
        : [{ organization: { id: organization.id, name: organization.user.name }, level }],
    )
    .sort(
      (a, b) =>
        a.organization.name.localeCompare(b.organization.name) ||
        a.organization.id.localeCompare(b.organization.id),
    );
}

/** Les droits des Coachs de l'élément (#608), `NONE` compris, triés par nom. */
export function toCoachGrantDtos(rows: readonly GrantRow[]): CoachGrantDto[] {
  return rows
    .flatMap(({ level, coach }) => (coach == null ? [] : [{ coach, level }]))
    .sort(
      (a, b) => a.coach.name.localeCompare(b.coach.name) || a.coach.id.localeCompare(b.coach.id),
    );
}

/**
 * Le propriétaire, le droit de l'acteur et, pour le propriétaire seul, les droits accordés.
 *
 * L'élément vient d'une lecture scopée : l'acteur y a donc un droit. S'il n'en trouve aucun, le
 * filtre de l'extension et `effectiveAccess` ne disent plus la même règle — un bug, pas un cas.
 */
export function toAccessView(row: AccessRow, context: AccessContext): AccessView {
  const grants = toGrantDtos(row.accessGrants);
  const coachGrants = toCoachGrantDtos(row.accessGrants);
  const myAccess = required(
    effectiveAccess({
      ownerId: row.coach.id,
      actorId: context.actorId,
      grants,
      coachGrants,
      actorOrganizationIds: context.organizationIds,
    }),
    `[access] ${row.id} lu sans droit par ${context.actorId}`,
  );
  const isOwn = myAccess.level === MyAccessLevel.OWNER;
  return {
    owner: row.coach,
    myAccess,
    grants: isOwn ? grants : null,
    coachGrants: isOwn ? coachGrants : null,
  };
}

/**
 * Ce qui est À l'acteur, parmi ce qu'il lit (#607). Lire un modèle partageable ouvre aussi ce qu'on
 * lui partage ; ce filtre le ramène à ce qu'il possède — « Les miens » de la bibliothèque, la boîte
 * des débriefs, les rappels et leurs cibles. Jamais un élargissement : le filtre de l'extension
 * s'ajoute à celui-ci.
 */
export function ownedBy(actorId: string): { coachId: string } {
  return { coachId: actorId };
}

/**
 * La portée d'une liste de la bibliothèque (`?scope=`), sur ce que l'acteur peut déjà lire : tout,
 * ses propres éléments, ou ceux que d'autres Coachs lui ouvrent. Jamais un élargissement — le
 * filtre de l'extension s'ajoute à celui-ci.
 */
export function libraryScopeWhere(
  scope: LibraryScope,
  actorId: string,
): { coachId?: string | { not: string } } {
  if (scope === LibraryScope.MINE) return ownedBy(actorId);
  if (scope === LibraryScope.SHARED) return { coachId: { not: actorId } };
  return {};
}

/** Les droits d'un élément, entreprises et Coachs : ce que lit `effectiveAccess`. */
export type ElementGrants = {
  grants: readonly AccessGrantDto[];
  coachGrants: readonly CoachGrantDto[];
};

/**
 * Les droits de l'élément une fois les changements appliqués : `null` retire la ligne (« Aucun »
 * d'une entreprise, « Hérité » d'un Coach), un niveau la pose ou la remplace. Une ligne qui naît
 * prend l'id pour nom : le nom ne sert qu'à départager la provenance (`via`), que les appelants ne
 * lisent pas.
 */
export function grantsAfter(
  current: ElementGrants,
  { changes, coachChanges }: Pick<ChangeAccessInput, "changes" | "coachChanges">,
): ElementGrants {
  const organizations = new Map(current.grants.map((grant) => [grant.organization.id, grant]));
  for (const { organizationId, level } of changes) {
    const organization = organizations.get(organizationId)?.organization ?? {
      id: organizationId,
      name: organizationId,
    };
    if (level == null) organizations.delete(organizationId);
    else organizations.set(organizationId, { organization, level });
  }
  const coaches = new Map(current.coachGrants.map((grant) => [grant.coach.id, grant]));
  for (const { coachId, level } of coachChanges) {
    const coach = coaches.get(coachId)?.coach ?? { id: coachId, name: coachId };
    if (level == null) coaches.delete(coachId);
    else coaches.set(coachId, { coach, level });
  }
  return { grants: [...organizations.values()], coachGrants: [...coaches.values()] };
}

/** Une séance qui cite un exercice, et le Coach qui la possède. */
export type Citation = { sessionId: string; coachId: string };

/**
 * Les séances d'autres Coachs dont le propriétaire perdrait la lecture de l'exercice qu'elles
 * citent si les changements s'appliquaient (#605, écart assumé jusqu'à #609) : il le lisait, et ne
 * le lirait plus. La règle est celle d'`effectiveAccess`, avant et après : sa ligne de Coach mise à
 * « Aucun » le prive (#608), une ligne qui lui reste le protège du retrait de son entreprise.
 * Passer d'Écriture à Lecture ne retire rien ; un Coach qui ne lisait déjà plus l'exercice ne perd
 * rien non plus, et ne doit pas tout bloquer.
 */
export function citationsLosingRead(
  ownerId: string,
  current: ElementGrants,
  input: Pick<ChangeAccessInput, "changes" | "coachChanges">,
  citations: readonly Citation[],
  organizationsOf: (coachId: string) => ReadonlySet<string>,
): string[] {
  const after = grantsAfter(current, input);
  const reads = (coachId: string, state: ElementGrants) =>
    effectiveAccess({
      ownerId,
      actorId: coachId,
      ...state,
      actorOrganizationIds: organizationsOf(coachId),
    }) != null;
  return citations
    .filter(({ coachId }) => reads(coachId, current) && !reads(coachId, after))
    .map(({ sessionId }) => sessionId);
}
