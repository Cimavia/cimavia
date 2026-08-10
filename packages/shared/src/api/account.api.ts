import type { AthleteSheetDto, UpdateAthleteSheetInput } from "../dto/athlete-sheet.schema";
import type { CoachAthleteDto } from "../dto/coach-athlete.schema";
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  InvitationDto,
} from "../dto/invitation.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP de la relation coach ↔ athlète, partagés web ↔ mobile : les athlètes d'un coach, la
 * fiche de suivi, les invitations, et le coach d'un athlète.
 *
 * Un seul module parce que c'est un seul module côté API (`account/`), et surtout parce que c'est
 * **une seule relation lue par ses deux bouts** : `GET /athletes` et `GET /me/coach` répondent à la
 * même question posée depuis les deux côtés de la même ligne `CoachAthlete`.
 *
 * Les deux moitiés sont bi-clientes en même temps, chacune dans un sens :
 * - moitié **athlète** (`myCoach`, `acceptInvitation`) : écrite pour le mobile, réclamée par le web
 *   en #28 ;
 * - moitié **coach** (`listAthletes`, fiche, invitations) : écrite pour le web, réclamée par le
 *   mobile en #30 et #31.
 *
 * Chaque route reste gardée par rôle côté API (`@Roles`) — ce module ne décide de rien, il décrit.
 * Un client qui appelle la moitié qui n'est pas la sienne prend un 403 : c'est aux écrans de ne pas
 * le faire, garde de route à l'appui.
 */

// Trois racines distinctes plutôt qu'une : ce sont trois ressources, et une mutation d'invitation
// n'a aucune raison de périmer la fiche d'un athlète.
export const athleteKeys = {
  all: ["athletes"] as const,
  list: () => ["athletes", "list"] as const,
  sheet: (athleteId: string) => ["athletes", "sheet", athleteId] as const,
};

export const invitationKeys = {
  all: ["invitations"] as const,
  list: () => ["invitations", "list"] as const,
};

export const coachKeys = {
  all: ["coach"] as const,
  mine: () => ["coach", "mine"] as const,
};

export type AccountApi = {
  // ── Côté coach ─────────────────────────────────────────────────────────────
  /** Les athlètes du coach courant (relations `ACTIVE`). */
  listAthletes: () => Promise<CoachAthleteDto[]>;
  /** `null` tant que le coach n'a rien écrit — l'absence de fiche est un état normal. */
  getAthleteSheet: (athleteId: string) => Promise<AthleteSheetDto | null>;
  saveAthleteSheet: (athleteId: string, input: UpdateAthleteSheetInput) => Promise<AthleteSheetDto>;
  listInvitations: () => Promise<InvitationDto[]>;
  createInvitation: (input: CreateInvitationInput) => Promise<InvitationDto>;

  // ── Côté athlète ───────────────────────────────────────────────────────────
  /**
   * Le coach de l'athlète courant, ou `null` s'il n'en a pas. Le `null` n'est pas une erreur :
   * l'athlète autonome est un état prévu du modèle (relation nullable dès P1).
   */
  myCoach: () => Promise<CoachAthleteDto | null>;
  /** Rejoint un coach avec le code qu'il a communiqué. 409 si l'athlète est déjà lié. */
  acceptInvitation: (input: AcceptInvitationInput) => Promise<CoachAthleteDto>;
};

export function createAccountApi(api: ApiClient): AccountApi {
  return {
    listAthletes: () => api.get<CoachAthleteDto[]>("/athletes"),
    getAthleteSheet: (athleteId) => api.get<AthleteSheetDto | null>(`/athletes/${athleteId}/sheet`),
    saveAthleteSheet: (athleteId, input) =>
      api.put<AthleteSheetDto>(`/athletes/${athleteId}/sheet`, input),
    listInvitations: () => api.get<InvitationDto[]>("/invitations"),
    createInvitation: (input) => api.post<InvitationDto>("/invitations", input),

    myCoach: () => api.get<CoachAthleteDto | null>("/me/coach"),
    acceptInvitation: (input) => api.post<CoachAthleteDto>("/invitations/accept", input),
  };
}
