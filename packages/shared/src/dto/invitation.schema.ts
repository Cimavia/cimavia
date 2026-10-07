import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

/**
 * Cycle de vie d'une invitation, nominative depuis #390 — d'un Coach à un athlète, ou d'une
 * entreprise à un Coach depuis #601.
 *
 * PENDING : émise, non encore utilisée ; ACCEPTED : redeemée (→ crée/active CoachAthlete) ;
 * DECLINED : l'invité a dit non ; REVOKED : annulée par son émetteur. L'expiration (`expiresAt`
 * dépassé) est évaluée à la redemption, elle n'est pas un statut.
 *
 * `DECLINED` est une valeur À PART et non un `REVOKED` réutilisé (#146). Les confondre ferait
 * perdre au coach la seule information qui l'intéresse : savoir qu'on lui a dit non, plutôt que
 * de croire qu'il a annulé lui-même.
 */
export const InvitationStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  REVOKED: "REVOKED",
} as const;

export type InvitationStatus = TypesValuesOf<typeof InvitationStatus>;

export const invitationStatusSchema = z.enum(InvitationStatus);

/**
 * Ce que l'invitation propose de devenir (#601) : athlète d'un Coach, ou Coach d'une entreprise.
 * Une invitation de Coach n'est émise que par une entreprise — un CHECK le tient en base.
 *
 * Chaque côté ne lit que le rôle qui le concerne : la carte d'un athlète ne propose jamais de
 * devenir Coach, et l'inverse. Sans ce filtre, accepter « en athlète » une invitation de Coach
 * créerait un lien sans Coach.
 */
export const InvitationRole = {
  ATHLETE: "ATHLETE",
  COACH: "COACH",
} as const;

export type InvitationRole = TypesValuesOf<typeof InvitationRole>;

export const invitationRoleSchema = z.enum(InvitationRole);

/**
 * Entrée : le coach invite une ADRESSE (#390). Elle est requise : une invitation sans adresse
 * n'apparaîtrait à personne, et le code qu'on transmettait de la main à la main n'existe plus.
 *
 * Accepter et refuser n'ont plus de schéma d'entrée : la route désigne l'invitation par son `id`,
 * et c'est l'adresse de la SESSION qui fait le verrou — un second identifiant à côté de l'`id`
 * que la carte porte déjà ferait lire deux fois la même information.
 */
export const createInvitationSchema = z
  .object({
    email: z.email(),
  })
  .strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

// DTO de sortie.
export const invitationDtoSchema = z.object({
  id: z.string(),
  email: z.email(),
  status: invitationStatusSchema,
  role: invitationRoleSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export type InvitationDto = z.infer<typeof invitationDtoSchema>;

/**
 * Une invitation qui ATTEND l'athlète courant (#146) — ce que `GET /invitations/for-me` renvoie.
 *
 * Un DTO à part et non `InvitationDto` amputé : les deux listes ne répondent pas à la même
 * question. Le coach administre les siennes (qui a été invité, où en est chacune) ; l'athlète n'a
 * qu'un geste à faire, et trois champs suffisent à le lui proposer.
 *
 * Ce qui n'y est PAS, et pourquoi :
 * - **`email`** — c'est la sienne, par construction : la liste ne contient que les invitations
 *   adressées à l'adresse de sa session.
 * - **`coachId`** — un athlète n'a rien à en faire, et l'exposer ferait de cette route un annuaire
 *   des coachs qui invitent.
 * - **`status`** — toujours `PENDING` : une invitation acceptée, refusée ou expirée ne figure pas
 *   dans cette liste.
 *
 * `coachName` est REQUIS, comme sur `CoachAthleteDto` : une invitation dont on ne saurait pas
 * nommer l'émetteur ne se propose pas, elle signale une donnée incohérente (règle dure n°5).
 * L'`id` suffit à l'accepter ou à la refuser (#390) : il n'est pas un secret, l'adresse de la
 * session l'est — l'`id` d'une invitation adressée à quelqu'un d'autre rend 404.
 */
export const pendingInvitationDtoSchema = z.object({
  id: z.string(),
  coachName: z.string(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export type PendingInvitationDto = z.infer<typeof pendingInvitationDtoSchema>;
