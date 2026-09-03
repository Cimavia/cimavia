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

/**
 * A-t-on quelqu'un en face ? Un drapeau par espace (#198).
 *
 * Servi par une route SANS capacité exigée, et c'est tout l'intérêt : la navigation le lit avant
 * de savoir à quel titre elle s'affiche. Le déduire de `GET /athletes` et `GET /me/coach` — toutes
 * deux gardées par capacité — ferait prendre un 403 à un compte mono-capacité sur chaque écran,
 * exactement la dérive que décrit `CmvRoleGate`.
 *
 * Ce n'est PAS une capacité : `isCoach` dit ce que le compte a le droit de faire, `asCoach` dit
 * s'il a quelqu'un à qui le faire. Un coach qui n'a pas encore d'athlète porte l'une sans l'autre.
 *
 * L'auto-coaching ne compte dans aucun des deux : le CHECK `coach_athlete_not_self` (#11) interdit
 * la ligne, et l'entrée synthétique de `GET /athletes` (#14) ne passe pas par ici.
 */
export const counterpartsDtoSchema = z.object({
  /** Au moins un athlète TIERS actif — l'entrée synthétique de l'auto-coaching ne compte pas. */
  asCoach: z.boolean(),
  /** Un coach actif. Faux pour un athlète autonome comme pour un compte qui se coache seul. */
  asAthlete: z.boolean(),
});

export type CounterpartsDto = z.infer<typeof counterpartsDtoSchema>;
