import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

// Cycle de vie d'une invitation coach→athlète (lien/code).
// PENDING : émise, non encore utilisée ; ACCEPTED : redeemée (→ crée/active CoachAthlete) ;
// REVOKED : annulée par le coach. L'expiration (expiresAt dépassé) est évaluée à la redemption.
export const InvitationStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
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
