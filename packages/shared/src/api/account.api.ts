import type { AthleteSheetDto, UpdateAthleteSheetInput } from "../dto/athlete-sheet.schema";
import type { CoachAthleteDto, CounterpartsDto } from "../dto/coach-athlete.schema";
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  DeclineInvitationInput,
  InvitationDto,
  PendingInvitationDto,
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
  /**
   * Les invitations qui attendent l'athlète courant (#146) — SOUS la même racine que la liste du
   * coach, et c'est voulu : les deux vues portent sur la même table, et refuser une invitation
   * doit périmer les deux d'un seul `invalidateQueries({ queryKey: invitationKeys.all })`.
   *
   * Un compte à double capacité tient donc les deux en cache en même temps, sans qu'elles se
   * marchent dessus — ce sont deux clés distinctes.
   */
  forMe: () => ["invitations", "for-me"] as const,
};

export const coachKeys = {
  all: ["coach"] as const,
  mine: () => ["coach", "mine"] as const,
};

/**
 * Racine à part, et non une clé sous `athletes` ou `coach` : les contreparties se lisent par un
 * compte qui n'a peut-être ni l'une ni l'autre de ces deux listes. Les ranger sous une racine
 * gardée par capacité ferait périmer l'une avec l'autre pour rien.
 */
export const counterpartKeys = {
  all: ["counterparts"] as const,
  mine: () => ["counterparts", "mine"] as const,
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
  /**
   * Efface une invitation REFUSÉE. 409 sur tout autre état — retirer une invitation en attente
   * serait une révocation, qui est une transition à part et n'a pas de chemin.
   */
  deleteInvitation: (invitationId: string) => Promise<void>;

  // ── Côté athlète ───────────────────────────────────────────────────────────
  /**
   * Le coach de l'athlète courant, ou `null` s'il n'en a pas. Le `null` n'est pas une erreur :
   * l'athlète autonome est un état prévu du modèle (relation nullable dès P1).
   */
  myCoach: () => Promise<CoachAthleteDto | null>;
  /**
   * Les invitations nominatives qui attendent l'athlète courant (#146) — `PENDING`, non expirées,
   * adressées à l'adresse de SA session. Le filtre n'est pas un paramètre : la route le tire de la
   * session, sans quoi elle deviendrait l'annuaire de qui a été invité par qui.
   *
   * Liste vide = personne ne l'a invité. C'est un état normal, pas une erreur.
   */
  myInvitations: () => Promise<PendingInvitationDto[]>;
  /** Rejoint un coach avec le code qu'il a communiqué. 409 si l'athlète est déjà lié. */
  acceptInvitation: (input: AcceptInvitationInput) => Promise<CoachAthleteDto>;
  /**
   * Refuse une invitation. Le geste est SANS RETOUR — le coach devra réémettre —, et il exige une
   * correspondance d'adresse stricte côté API, là où l'acceptation ne la vérifie que sur une
   * invitation nominative.
   */
  declineInvitation: (input: DeclineInvitationInput) => Promise<void>;

  // ── Les deux côtés à la fois ───────────────────────────────────────────────
  /**
   * A-t-on quelqu'un en face, de chaque côté ? (#198)
   *
   * La SEULE route de ce module qui n'exige aucune capacité, et c'est sa raison d'être : la
   * navigation la lit avant de savoir à quel titre elle s'affiche. Les deux moitiés ci-dessus ne
   * peuvent pas répondre — un compte mono-capacité prendrait un 403 sur l'une des deux.
   */
  myCounterparts: () => Promise<CounterpartsDto>;
};

export function createAccountApi(api: ApiClient): AccountApi {
  return {
    listAthletes: () => api.get<CoachAthleteDto[]>("/athletes"),
    getAthleteSheet: (athleteId) => api.get<AthleteSheetDto | null>(`/athletes/${athleteId}/sheet`),
    saveAthleteSheet: (athleteId, input) =>
      api.put<AthleteSheetDto>(`/athletes/${athleteId}/sheet`, input),
    listInvitations: () => api.get<InvitationDto[]>("/invitations"),
    createInvitation: (input) => api.post<InvitationDto>("/invitations", input),
    deleteInvitation: (invitationId) => api.delete<void>(`/invitations/${invitationId}`),

    myCoach: () => api.get<CoachAthleteDto | null>("/me/coach"),
    myInvitations: () => api.get<PendingInvitationDto[]>("/invitations/for-me"),
    acceptInvitation: (input) => api.post<CoachAthleteDto>("/invitations/accept", input),
    declineInvitation: (input) => api.post<void>("/invitations/decline", input),

    myCounterparts: () => api.get<CounterpartsDto>("/me/counterparts"),
  };
}
