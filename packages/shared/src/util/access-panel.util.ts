import type {
  AccessGrantDto,
  ChangeAccessInput,
  OrganizationAccessLevel,
} from "../dto/access.schema";

/** La valeur d'une ligne du panneau qui diffère entre les éléments sélectionnés. */
export const MIXED_ACCESS = "MIXED";

/**
 * Ce qu'une ligne d'entreprise du panneau des accès affiche (#606) : un niveau, « Aucun » (`null`,
 * l'absence de ligne de droit), ou « Mixte » quand les éléments sélectionnés ne s'accordent pas.
 */
export type PanelAccess = OrganizationAccessLevel | null | typeof MIXED_ACCESS;

/**
 * La valeur de chaque entreprise sur la sélection (maquette #597, frame 6) : celle que tous les
 * éléments partagent, ou « Mixte ». Un seul élément ne peut pas être mixte.
 */
export function panelAccess(
  grantsOfEach: readonly (readonly AccessGrantDto[])[],
  organizationIds: readonly string[],
): Map<string, PanelAccess> {
  return new Map(
    organizationIds.map((organizationId) => {
      const levels = new Set(
        grantsOfEach.map(
          (grants) =>
            grants.find((grant) => grant.organization.id === organizationId)?.level ?? null,
        ),
      );
      const [only] = levels;
      return [organizationId, levels.size === 1 && only !== undefined ? only : MIXED_ACCESS];
    }),
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
): ChangeAccessInput["changes"] {
  return [...edited].flatMap(([organizationId, level]) =>
    level === MIXED_ACCESS || level === initial.get(organizationId)
      ? []
      : [{ organizationId, level }],
  );
}
