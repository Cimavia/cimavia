import {
  type AccessGrantDto,
  AccessLevel,
  type AccessOwner,
  type ChangeAccessInput,
  effectiveAccess,
  LibraryScope,
  type MyAccess,
  MyAccessLevel,
  required,
} from "@cmv/shared";
import type { Prisma } from "@prisma/client";

/**
 * Ce qu'un exercice, une séance ou une planification (#607) doit charger pour dire qui le possède
 * et ce que l'acteur peut en faire (#605). Imbriqué, donc hors du scope de l'extension (piège n°2) — c'est voulu : ce sont
 * les droits de l'élément déjà prouvé lisible, et seul son propriétaire les recevra tels quels.
 *
 * Les lignes d'entreprise seulement : celle d'un Coach arrive avec #608.
 */
export const ACCESS_INCLUDE = {
  coach: { select: { id: true, name: true } },
  accessGrants: {
    where: { organizationId: { not: null } },
    select: {
      level: true,
      organization: { select: { id: true, user: { select: { name: true } } } },
    },
  },
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
};

/** Les droits d'entreprise de l'élément, triés par nom : l'ordre du panneau. */
export function toGrantDtos(rows: AccessRow["accessGrants"]): AccessGrantDto[] {
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

/**
 * Le propriétaire, le droit de l'acteur et, pour le propriétaire seul, les droits accordés.
 *
 * L'élément vient d'une lecture scopée : l'acteur y a donc un droit. S'il n'en trouve aucun, le
 * filtre de l'extension et `effectiveAccess` ne disent plus la même règle — un bug, pas un cas.
 */
export function toAccessView(row: AccessRow, context: AccessContext): AccessView {
  const grants = toGrantDtos(row.accessGrants);
  const myAccess = required(
    effectiveAccess({
      ownerId: row.coach.id,
      actorId: context.actorId,
      grants,
      actorOrganizationIds: context.organizationIds,
    }),
    `[access] ${row.id} lu sans droit par ${context.actorId}`,
  );
  return {
    owner: row.coach,
    myAccess,
    grants: myAccess.level === MyAccessLevel.OWNER ? grants : null,
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

/**
 * Les entreprises qui ont encore une ligne sur l'élément une fois `changes` appliqués : celles qui
 * en avaient une et n'ont pas reçu « Aucun », plus celles qui en reçoivent une. Lecture et Écriture
 * ouvrent toutes deux la lecture : seule la présence de la ligne compte ici.
 */
export function organizationsReadingAfter(
  current: readonly AccessGrantDto[],
  changes: readonly ChangeAccessInput["changes"][number][],
): Set<string> {
  const reading = new Set(current.map((grant) => grant.organization.id));
  for (const { organizationId, level } of changes) {
    if (level == null) reading.delete(organizationId);
    else reading.add(organizationId);
  }
  return reading;
}

/** Une séance qui cite un exercice, et le Coach qui la possède. */
export type Citation = { sessionId: string; coachId: string };

/**
 * Les séances d'autres Coachs dont le propriétaire perdrait la lecture de l'exercice qu'elles
 * citent si `changes` s'appliquaient (#605, écart assumé jusqu'à #609) : il la tenait d'une de ses
 * entreprises, et n'en garderait aucune. Passer d'Écriture à Lecture ne retire rien ; un Coach qui
 * ne lisait déjà plus l'exercice ne perd rien non plus, et ne doit pas tout bloquer.
 */
export function citationsLosingRead(
  current: readonly AccessGrantDto[],
  changes: readonly ChangeAccessInput["changes"][number][],
  citations: readonly Citation[],
  organizationsOf: (coachId: string) => ReadonlySet<string>,
): string[] {
  const before = organizationsReadingAfter(current, []);
  const after = organizationsReadingAfter(current, changes);
  const readsThrough = (coachId: string, reading: ReadonlySet<string>) =>
    [...organizationsOf(coachId)].some((id) => reading.has(id));
  return citations
    .filter(({ coachId }) => readsThrough(coachId, before) && !readsThrough(coachId, after))
    .map(({ sessionId }) => sessionId);
}
