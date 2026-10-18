/**
 * Une entreprise et ses Coachs, de quoi juger d'une éligibilité. Les noms ne servent qu'au panneau
 * (`CoachOrganizationDto`) : le défaut et la garde de l'octroi s'en passent (#607).
 */
type OrganizationCoaches = { id: string; coaches: readonly { coachId: string }[] };

/**
 * Les entreprises auxquelles le propriétaire peut ouvrir une planification (#607) : les siennes,
 * réduites aux Coachs qui suivent son athlète. Un droit ne vaut que pour les Coachs de l'athlète —
 * une entreprise dont aucun autre Coach ne le suit n'aurait personne à qui l'ouvrir, et le panneau
 * le dit au lieu de l'afficher (maquette #597, frame 10).
 *
 * `athleteCoachIds` à `null` : la planification n'a pas encore d'athlète (#144). Elle se partage
 * alors comme un exercice, à toutes les entreprises du propriétaire, Coachs compris.
 */
export function eligibleOrganizations<O extends OrganizationCoaches>(
  organizations: readonly O[],
  athleteCoachIds: ReadonlySet<string> | null,
  ownerId: string,
): O[] {
  if (athleteCoachIds == null) return [...organizations];
  return organizations.flatMap((organization) => {
    const coaches = organization.coaches.filter((coach) => athleteCoachIds.has(coach.coachId));
    return coaches.some((coach) => coach.coachId !== ownerId) ? [{ ...organization, coaches }] : [];
  });
}

/**
 * L'entreprise qui reçoit l'Écriture par défaut quand une planification naît pour un athlète, ou
 * lui est affectée (#607) : celle par laquelle passe le lien du propriétaire avec cet athlète, si
 * elle est éligible et que le propriétaire n'y a encore aucune ligne. « Aucun » réglé exprès est
 * une ligne (`NONE`) : le défaut ne la rouvre pas.
 *
 * `null` : rien à poser — lien direct, entreprise sans autre Coach de l'athlète, ou déjà réglée.
 */
export function defaultPlanGrant(
  linkOrganizationId: string | null,
  eligible: readonly Pick<OrganizationCoaches, "id">[],
  settledOrganizationIds: ReadonlySet<string>,
): string | null {
  if (linkOrganizationId == null || settledOrganizationIds.has(linkOrganizationId)) return null;
  return eligible.some((organization) => organization.id === linkOrganizationId)
    ? linkOrganizationId
    : null;
}
