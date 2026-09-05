import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

/**
 * Cycle de vie d'une invitation coach→athlète (lien/code).
 *
 * PENDING : émise, non encore utilisée ; ACCEPTED : redeemée (→ crée/active CoachAthlete) ;
 * DECLINED : l'athlète a dit non ; REVOKED : annulée par le coach. L'expiration (`expiresAt`
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

// Entrée : le coach crée une invitation. email optionnel (invitation nominative) ;
// absent = lien générique acceptable par n'importe quel athlète non lié.
export const createInvitationSchema = z
  .object({
    email: z.email().optional(),
  })
  .strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

// Entrée : un athlète accepte une invitation via son code.
export const acceptInvitationSchema = z
  .object({
    code: z.string().min(1),
  })
  .strict();

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/**
 * Entrée : un athlète refuse une invitation via son code (#146).
 *
 * Même forme qu'`acceptInvitationSchema`, et pourtant un schéma distinct : ce sont deux
 * TRANSITIONS différentes, chacune avec sa route. Les faire partager un type ferait croire qu'une
 * seule chose se passe, et empêcherait le refus de gagner un jour son propre champ (un motif, une
 * case « ne plus me proposer ») sans toucher à l'acceptation.
 *
 * Le refus est plus strict que l'acceptation côté service : il exige une correspondance d'e-mail
 * en toutes circonstances, là où `accept` ne la vérifie que sur une invitation nominative — sans
 * quoi le premier détenteur d'un code générique le brûlerait pour tout le monde.
 */
export const declineInvitationSchema = z
  .object({
    code: z.string().min(1),
  })
  .strict();

export type DeclineInvitationInput = z.infer<typeof declineInvitationSchema>;

// DTO de sortie.
export const invitationDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  email: z.email().nullable(),
  status: invitationStatusSchema,
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
 * `code` y figure parce que l'acceptation ne change pas — le client le reprend et appelle le
 * `POST /invitations/accept` existant, plutôt qu'une seconde route vers la même transition (#105).
 */
export const pendingInvitationDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  coachName: z.string(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export type PendingInvitationDto = z.infer<typeof pendingInvitationDtoSchema>;
