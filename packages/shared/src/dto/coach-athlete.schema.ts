import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

// Statut de la relation coach↔athlète.
// PENDING : invitation acceptée mais lien pas encore actif (réservé si besoin d'un palier) ;
// ACTIVE  : relation effective. La réversibilité (athlète autonome v1.0) = suppression de la ligne.
export const CoachAthleteStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
} as const;

export type CoachAthleteStatus = TypesValuesOf<typeof CoachAthleteStatus>;

export const coachAthleteStatusSchema = z.enum(CoachAthleteStatus);

// DTO de sortie : la relation telle que renvoyée par l'API.
// Les NOMS des deux parties sont portés par la relation : sans eux, le coach ne verrait dans son
// builder que des identifiants opaques, et devrait appeler une seconde route par athlète.
export const coachAthleteDtoSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  coachName: z.string(),
  athleteId: z.string(),
  athleteName: z.string(),
  status: coachAthleteStatusSchema,
  invitedAt: z.iso.datetime(),
  joinedAt: z.iso.datetime().nullable(),
});

export type CoachAthleteDto = z.infer<typeof coachAthleteDtoSchema>;
