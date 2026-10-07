import type { AthleteSheetDto, UpdateAthleteSheetInput } from "../dto/athlete-sheet.schema";
import type { CoachAthleteDto, CounterpartsDto } from "../dto/coach-athlete.schema";
import type {
  CreateInvitationInput,
  InvitationDto,
  PendingInvitationDto,
} from "../dto/invitation.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP de la relation coach ↔ athlète, partagés web ↔ mobile : les athlètes d'un coach, la
 * fiche de suivi, les invitations, et le coach d'un athlète.
 *
 * Un seul module parce que c'est un seul module côté API (`account/`), et surtout parce que c'est
 * **une seule relation lue par ses deux bouts** : `GET /athletes` et `GET /me/coaches` répondent à la
 * même question posée depuis les deux côtés de la même ligne `CoachAthlete`.
 *
 * Les deux moitiés sont bi-clientes en même temps, chacune dans un sens :
 * - moitié **athlète** (`myCoaches`, `acceptInvitation`) : écrite pour le mobile, réclamée par le web
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
  list: () => ["coach", "list"] as const,
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
   * Efface une invitation REFUSÉE. 409 sur tout autre état — retirer une invitation en attente est
   * une révocation, une transition à part : `revokeInvitation`.
   */
  deleteInvitation: (invitationId: string) => Promise<void>;
  /**
   * Retire une invitation EN ATTENTE (#524) : elle passe `REVOKED` et quitte la liste du coach.
   * 409 sur tout autre état ; son destinataire, s'il tente encore de l'accepter, lit « retirée ».
   */
  revokeInvitation: (invitationId: string) => Promise<void>;

  // ── Côté athlète ───────────────────────────────────────────────────────────
  /**
   * Les coachs de l'athlète courant, un par lien (#599). Liste vide = athlète autonome, ou qui se
   * coache seul : un état prévu du modèle, pas une erreur.
   */
  myCoaches: () => Promise<CoachAthleteDto[]>;
  /**
   * Les invitations nominatives qui attendent l'athlète courant (#146) — `PENDING`, non expirées,
   * adressées à l'adresse de SA session. Le filtre n'est pas un paramètre : la route le tire de la
   * session, sans quoi elle deviendrait l'annuaire de qui a été invité par qui.
   *
   * Liste vide = personne ne l'a invité. C'est un état normal, pas une erreur.
   */
  myInvitations: () => Promise<PendingInvitationDto[]>;
  /**
   * Rejoint le coach qui a émis cette invitation. 409 si l'athlète est déjà lié ; 404 si elle ne
   * vise pas l'adresse de sa session — l'`id` n'est pas un secret, l'adresse l'est (#390).
   */
  acceptInvitation: (invitationId: string) => Promise<CoachAthleteDto>;
  /** Refuse une invitation. Le geste est SANS RETOUR : le coach devra réémettre. */
  declineInvitation: (invitationId: string) => Promise<void>;

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
    revokeInvitation: (invitationId) => api.post<void>(`/invitations/${invitationId}/revoke`),

    myCoaches: () => api.get<CoachAthleteDto[]>("/me/coaches"),
    myInvitations: () => api.get<PendingInvitationDto[]>("/invitations/for-me"),
    acceptInvitation: (invitationId) =>
      api.post<CoachAthleteDto>(`/invitations/${invitationId}/accept`),
    declineInvitation: (invitationId) => api.post<void>(`/invitations/${invitationId}/decline`),

    myCounterparts: () => api.get<CounterpartsDto>("/me/counterparts"),
  };
}
