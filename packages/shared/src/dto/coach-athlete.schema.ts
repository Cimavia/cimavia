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

/**
 * Identifiant de la relation SYNTHÉTIQUE d'un compte avec lui-même (auto-coaching, #14).
 *
 * Un coach qui se coache n'a pas de ligne `CoachAthlete` — et ne doit pas en avoir : le CHECK
 * `coach_athlete_not_self` l'interdit depuis #11. Il apparaît pourtant dans sa propre liste
 * d'athlètes, pour pouvoir se désigner comme destinataire d'un cycle sans que le builder ni le
 * tableau de bord n'aient à connaître ce cas.
 *
 * Un identifiant réservé plutôt qu'une chaîne vide : il se reconnaît dans un log, et il ne peut
 * pas se confondre avec un `cuid` réel.
 */
export const SELF_RELATION_ID = "self";

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
  /**
   * Le compte est son PROPRE athlète (auto-coaching). Un drapeau plutôt qu'une comparaison
   * `coachId === athleteId` recopiée dans chaque écran : l'information est la même, mais elle est
   * ici nommée une fois pour toutes, et le jour où le modèle change il n'y a qu'un endroit à
   * suivre.
   */
  isSelf: z.boolean(),
});

export type CoachAthleteDto = z.infer<typeof coachAthleteDtoSchema>;
