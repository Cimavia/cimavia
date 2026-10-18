import type {
  AccessGrantDto,
  AccessLevel,
  CoachChange,
  CoachGrantDto,
  CoachOrganizationDto,
  OrganizationAccessLevel,
  OrganizationChange,
} from "../dto/access.schema";

/** La valeur d'une ligne du panneau qui diffère entre les éléments sélectionnés. */
export const MIXED_ACCESS = "MIXED";

/**
 * Ce qu'une ligne d'entreprise du panneau des accès affiche (#606) : un niveau, « Aucun » (`null`,
 * l'absence de ligne de droit), ou « Mixte » quand les éléments sélectionnés ne s'accordent pas.
 */
export type PanelAccess = OrganizationAccessLevel | null | typeof MIXED_ACCESS;

/**
 * Ce qu'une ligne de Coach affiche (#608) : « Hérité » (`null`, l'absence de ligne : il suit ses
 * entreprises), « Aucun » (`NONE`, qui ferme), un niveau, ou « Mixte ».
 */
export type CoachPanelAccess = AccessLevel | null | typeof MIXED_ACCESS;

/**
 * La valeur de chaque bénéficiaire sur la sélection : celle que tous les éléments partagent, ou
 * « Mixte ». Un seul élément ne peut pas être mixte ; aucun, si — rien n'y est commun.
 */
function commonValues<G, V>(
  grantsOfEach: readonly (readonly G[])[],
  ids: readonly string[],
  idOf: (grant: G) => string,
  levelOf: (grant: G) => V,
): Map<string, V | null | typeof MIXED_ACCESS> {
  return new Map(
    ids.map((id) => {
      const levels = new Set(
        grantsOfEach.map((grants) => {
          const grant = grants.find((candidate) => idOf(candidate) === id);
          return grant === undefined ? null : levelOf(grant);
        }),
      );
      const [only] = levels;
      return [id, levels.size === 1 && only !== undefined ? only : MIXED_ACCESS];
    }),
  );
}

/** La valeur de chaque entreprise sur la sélection (maquette #597, frame 6). */
export function panelAccess(
  grantsOfEach: readonly (readonly AccessGrantDto[])[],
  organizationIds: readonly string[],
): Map<string, PanelAccess> {
  return commonValues(
    grantsOfEach,
    organizationIds,
    (grant) => grant.organization.id,
    (grant) => grant.level,
  );
}

/** La valeur de chaque Coach sur la sélection (#608) : « Hérité » sans ligne. */
export function panelCoachAccess(
  coachGrantsOfEach: readonly (readonly CoachGrantDto[])[],
  coachIds: readonly string[],
): Map<string, CoachPanelAccess> {
  return commonValues(
    coachGrantsOfEach,
    coachIds,
    (grant) => grant.coach.id,
    (grant) => grant.level,
  );
}

/** Les lignes CHANGÉES : ni laissées « Mixte », ni remises à leur valeur de départ. */
function changed<V>(
  initial: ReadonlyMap<string, V | typeof MIXED_ACCESS>,
  edited: ReadonlyMap<string, V | typeof MIXED_ACCESS>,
): [string, V][] {
  return [...edited].flatMap(([id, level]) =>
    level === MIXED_ACCESS || level === initial.get(id) ? [] : [[id, level as V]],
  );
}

/**
 * Ce que le panneau envoie : les seules lignes CHANGÉES (tranché en #597). Une ligne laissée
 * « Mixte » n'en fait pas partie, et chaque élément garde sa valeur ; la remettre à la valeur de
 * départ non plus. Vide = rien à enregistrer.
 */
export function accessChanges(
  initial: ReadonlyMap<string, PanelAccess>,
  edited: ReadonlyMap<string, PanelAccess>,
): OrganizationChange[] {
  return changed(initial, edited).map(([organizationId, level]) => ({ organizationId, level }));
}

/** Les lignes de Coach changées (#608), selon la même règle ; « Hérité » s'envoie `null`. */
export function coachAccessChanges(
  initial: ReadonlyMap<string, CoachPanelAccess>,
  edited: ReadonlyMap<string, CoachPanelAccess>,
): CoachChange[] {
  return changed(initial, edited).map(([coachId, level]) => ({ coachId, level }));
}

/**
 * Ce que « Hérité » donne à un Coach (#608, frame 5) : le plus large des droits de SES entreprises
 * dans le panneau, telles qu'elles sont réglées à l'instant — pas seulement celle sous laquelle il
 * apparaît. « Mixte » si l'une d'elles l'est : le droit hérité diffère alors d'un élément à
 * l'autre (frame 6). `null` : aucune ne l'ouvre.
 */
export function inheritedAccess(
  organizationIds: readonly string[],
  organizationValues: ReadonlyMap<string, PanelAccess>,
): PanelAccess {
  const values = new Set(organizationIds.map((id) => organizationValues.get(id) ?? null));
  if (values.has(MIXED_ACCESS)) return MIXED_ACCESS;
  if (values.has("WRITE")) return "WRITE";
  return values.has("READ") ? "READ" : null;
}

/** Un Coach d'une ligne du panneau, et toutes les entreprises du propriétaire dont il est. */
export type PanelCoach = { coachId: string; name: string; organizationIds: string[] };

/**
 * Les Coachs du panneau, en retrait sous leur entreprise (#608, frame 5) : tous sauf le
 * propriétaire. Un Coach membre de plusieurs entreprises n'apparaît qu'une fois, sous la première
 * dans l'ordre reçu : sa ligne est unique en base, la répéter laisserait croire à deux réglages.
 */
export function panelCoaches(
  organizations: readonly CoachOrganizationDto[],
  ownerId: string,
): { organizationId: string; coaches: PanelCoach[] }[] {
  const seen = new Set<string>([ownerId]);
  return organizations.map((organization) => ({
    organizationId: organization.id,
    coaches: organization.coaches.flatMap(({ coachId, name }) => {
      if (seen.has(coachId)) return [];
      seen.add(coachId);
      const organizationIds = organizations
        .filter((candidate) => candidate.coaches.some((coach) => coach.coachId === coachId))
        .map((candidate) => candidate.id);
      return [{ coachId, name, organizationIds }];
    }),
  }));
}
