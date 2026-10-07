import { z } from "zod";

/**
 * Un Coach membre de l'entreprise courante (#601), tel que l'entreprise le voit dans sa page
 * Coachs : nom, adresse, date d'arrivée.
 *
 * L'adresse y est, et ce n'est pas une fuite : l'entreprise l'a saisie elle-même pour l'inviter.
 * `name` est REQUIS, comme sur `CoachAthleteDto` : un membre qu'on ne saurait pas nommer signale
 * une donnée incohérente (règle dure n°5), la ligne `organization_coach` partant avec le compte.
 */
export const organizationCoachDtoSchema = z.object({
  coachId: z.string(),
  name: z.string(),
  email: z.email(),
  /** Date d'arrivée — « membre depuis ». */
  joinedAt: z.iso.datetime(),
});

export type OrganizationCoachDto = z.infer<typeof organizationCoachDtoSchema>;

/**
 * Un athlète de l'entreprise courante (#602), tel qu'elle le voit dans sa page Athlètes : nom,
 * adresse, date d'arrivée, et les Coachs qui le suivent.
 *
 * `coaches` se DÉDUIT de l'équipe — tous ses Coachs, sauf l'athlète lui-même s'il en est un — et
 * ne se lit pas dans les liens : l'entreprise ne voit aucun contenu d'entraînement, et un lien
 * direct antérieur ne doit pas se deviner. La règle « tous les Coachs suivent tous les athlètes »
 * fait que les deux disent la même chose. Liste vide = l'entreprise n'a pas encore de Coach.
 */
export const organizationAthleteDtoSchema = z.object({
  athleteId: z.string(),
  name: z.string(),
  email: z.email(),
  /** Date d'arrivée — « membre depuis ». */
  joinedAt: z.iso.datetime(),
  coaches: z.array(z.object({ coachId: z.string(), name: z.string() })),
});

export type OrganizationAthleteDto = z.infer<typeof organizationAthleteDtoSchema>;

/**
 * Une invitation d'entreprise qui ATTEND le Coach courant (#601) — le pendant, côté Coach, de
 * `PendingInvitationDto` côté athlète, et pour les mêmes raisons : ni `email` (c'est la sienne), ni
 * `organizationId` (la route deviendrait l'annuaire des entreprises qui recrutent), ni `status`
 * (toujours `PENDING`).
 *
 * `organizationName` est le `name` du compte Entreprise, le seul endroit où il vit (#600). Requis
 * pour la même raison que `coachName` : une invitation dont on ne saurait pas nommer l'émetteur ne
 * se propose pas.
 */
export const pendingOrganizationInvitationDtoSchema = z.object({
  id: z.string(),
  organizationName: z.string(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export type PendingOrganizationInvitationDto = z.infer<
  typeof pendingOrganizationInvitationDtoSchema
>;
