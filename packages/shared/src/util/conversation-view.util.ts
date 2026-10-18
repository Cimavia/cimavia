import type { TrainingCapability } from "../capability";
import {
  type ConversationCandidatesDto,
  type ConversationDto,
  ConversationKind,
  type CreateConversationInput,
  isFeedbackEventMessage,
  type MessageDto,
} from "../dto/message.schema";
import { searchMatcher } from "./search.util";

/**
 * Ce qu'une conversation à participants montre à l'un d'eux (#612) — titre, sous-titre, auteur
 * d'une bulle, « Lu par », préfixe de l'aperçu. Écrit une fois pour le web et le mobile : seule
 * la mise en forme change d'une plateforme à l'autre.
 *
 * `participants` nomme les AUTRES, triés par nom par l'API (#611) : l'acteur n'y figure jamais.
 */
type ParticipantsSource = Pick<ConversationDto, "kind" | "participants">;

/**
 * Le titre d'une conversation : ses autres participants, dans l'ordre de l'API. Pas de nom de
 * groupe (#611) : « C, M » est le titre de la conversation que TI a avec C et M.
 *
 * `null` quand plus personne n'y figure — un fil à deux dont l'autre compte a été effacé (MC-18) :
 * le titre ne s'invente pas, il se rend « — ».
 */
export function conversationTitle(conversation: ParticipantsSource): string | null {
  if (conversation.participants.length === 0) return null;
  return conversation.participants.map((participant) => participant.name).join(", ");
}

/**
 * Le sous-titre d'une conversation : à deux, la CAPACITÉ de l'autre (« Coach », « Athlète ») ; à
 * plusieurs, le nombre de participants, l'acteur compris (« 3 participants »).
 *
 * La capacité et non la provenance (« via F ») : la conversation ne la porte pas, elle vit dans
 * le sélecteur de création (écart à la maquette tranché en #598).
 */
export type ConversationSubtitle =
  | { kind: "capability"; capability: TrainingCapability }
  | { kind: "count"; count: number };

export function conversationSubtitle(
  conversation: ParticipantsSource,
): ConversationSubtitle | null {
  if (conversation.kind === ConversationKind.GROUP) {
    return { kind: "count", count: conversation.participants.length + 1 };
  }
  const [counterpart] = conversation.participants;
  return counterpart == null ? null : { kind: "capability", capability: counterpart.capability };
}

/**
 * L'auteur à nommer sur une bulle reçue : à plusieurs seulement — à deux, l'en-tête dit déjà qui
 * écrit.
 *
 * `null` = pas d'auteur à poser (fil à deux, ou c'est mon message). `{ name: null }` = un auteur
 * qu'on ne connaît plus — un compte effacé emporte sa ligne de participant (MC-18) —, qui se rend
 * « — » : la bulle a bien un auteur, on ne sait plus lequel.
 */
export function messageAuthorOf(
  conversation: ParticipantsSource,
  senderId: string,
  currentUserId: string | null,
): { name: string | null } | null {
  if (conversation.kind !== ConversationKind.GROUP || senderId === currentUserId) return null;
  const author = conversation.participants.find((participant) => participant.userId === senderId);
  return { name: author?.name ?? null };
}

/** Sous quel message poser « Lu par », et par qui. */
export type ReadBy = { messageId: string; names: string[] };

/**
 * « Lu par » d'une conversation à plusieurs : sous le DERNIER message que j'ai envoyé, les
 * participants dont la marque de lecture l'atteint (#611 : la marque est le `createdAt` du dernier
 * message vu, d'où le `>=`).
 *
 * `null` quand il n'y a rien à dire : fil à deux (pas d'accusé de lecture), aucun message de moi,
 * ou personne ne l'a encore lu — une ligne « Lu par » vide n'apprendrait rien.
 */
export function readByOf(
  conversation: ParticipantsSource,
  messages: readonly MessageDto[],
  currentUserId: string | null,
): ReadBy | null {
  if (conversation.kind !== ConversationKind.GROUP || currentUserId == null) return null;
  const lastSent = messages.filter((message) => message.senderId === currentUserId).at(-1);
  if (lastSent == null) return null;

  const sentAt = Date.parse(lastSent.createdAt);
  const names = conversation.participants
    .filter(
      (participant) =>
        participant.lastReadAt != null && Date.parse(participant.lastReadAt) >= sentAt,
    )
    .map((participant) => participant.name);
  return names.length === 0 ? null : { messageId: lastSent.id, names };
}

/**
 * Qui a écrit le dernier message, pour préfixer l'aperçu de la liste : « Vous : » pour le mien,
 * « M : » pour celui d'un autre À PLUSIEURS — à deux, l'autre est le titre de la ligne.
 *
 * `null` = pas de préfixe : conversation vide, avis de débrief (le serveur l'a posé, personne ne
 * l'a écrit), ou auteur dont la ligne de participant n'existe plus (MC-18) — un « — : » en tête
 * d'aperçu ne dirait rien de plus que l'aperçu seul.
 */
export type PreviewAuthor = { kind: "self" } | { kind: "participant"; name: string };

export function previewAuthorOf(
  conversation: ParticipantsSource &
    Pick<ConversationDto, "lastMessageSenderId" | "lastMessageType">,
  currentUserId: string | null,
): PreviewAuthor | null {
  const { lastMessageSenderId: senderId, lastMessageType: type } = conversation;
  if (senderId == null || (type != null && isFeedbackEventMessage(type))) return null;
  if (senderId === currentUserId) return { kind: "self" };
  if (conversation.kind !== ConversationKind.GROUP) return null;
  const author = conversation.participants.find((participant) => participant.userId === senderId);
  return author == null ? null : { kind: "participant", name: author.name };
}

// ── Sélecteur de participants ────────────────────────────────────────────────

/** Un participant choisi, tel que la création l'attend. */
export type ParticipantRef = CreateConversationInput["participants"][number];

/**
 * Coche ou décoche un candidat. Un candidat se reconnaît à son compte ET à sa capacité : un compte
 * à double capacité peut figurer parmi mes athlètes et parmi les Coachs de mes entreprises (#611).
 * Mais il ne se choisit qu'à UN titre — l'API refuse un même compte nommé deux fois : cocher
 * l'autre ligne remplace le premier choix plutôt que de préparer une création vouée au refus.
 */
export function toggleParticipant(
  selection: readonly ParticipantRef[],
  ref: ParticipantRef,
): ParticipantRef[] {
  const isSelected = selection.some((chosen) => isSameParticipant(chosen, ref));
  if (isSelected) return selection.filter((chosen) => !isSameParticipant(chosen, ref));
  return [...selection.filter((chosen) => chosen.userId !== ref.userId), ref];
}

export function isSameParticipant(a: ParticipantRef, b: ParticipantRef): boolean {
  return a.userId === b.userId && a.capability === b.capability;
}

/**
 * Les candidats dont le nom contient la recherche — même règle que toutes les recherches côté
 * client (`searchMatcher` : sans casse ni accent). Un terme vide garde tout.
 */
export function filterCandidates(
  candidates: ConversationCandidatesDto,
  search: string,
): ConversationCandidatesDto {
  const matches = searchMatcher(search);
  return {
    athletes: candidates.athletes.filter((athlete) => matches(athlete.name)),
    coaches: candidates.coaches.filter((coach) => matches(coach.name)),
  };
}

/**
 * Le nom de l'entreprise qui titre la section des Coachs côté Coach (« Coachs de F »), quand ils
 * viennent tous d'UNE entreprise. `null` sinon : à plusieurs entreprises, la section prend un titre
 * générique et chaque ligne nomme les siennes.
 */
export function singleOrganizationName(candidates: ConversationCandidatesDto): string | null {
  const names = new Set(candidates.coaches.flatMap((coach) => coach.organizationNames));
  return names.size === 1 ? ([...names][0] ?? null) : null;
}

/** Un Coach choisi qui ne suit pas certains des athlètes choisis. */
export type UnfollowedWarning = { coachId: string; coachName: string; athleteNames: string[] };

export type SelectionWarnings = {
  /** Deux athlètes ou plus : chacun verra les noms et les messages des autres. */
  athletesSeeEachOther: boolean;
  /** Prévenir plutôt qu'interdire (tranché en #598) : « M ne suit pas TE et verra ses messages. » */
  unfollowed: UnfollowedWarning[];
};

/**
 * Les avertissements d'une sélection, cumulables. Le second ne se juge que sur les Coachs dont on
 * connaît les suivis (`followedAthleteIds`, `null` côté athlète, où la question ne se pose pas) et
 * parmi MES athlètes : l'API ne dit rien d'autre (#611).
 */
export function selectionWarnings(
  candidates: ConversationCandidatesDto,
  selection: readonly ParticipantRef[],
): SelectionWarnings {
  const chosen = (capability: TrainingCapability, userId: string) =>
    selection.some((ref) => isSameParticipant(ref, { userId, capability }));
  const athletes = candidates.athletes.filter((athlete) => chosen("athlete", athlete.userId));

  const unfollowed = candidates.coaches.flatMap((coach): UnfollowedWarning[] => {
    const followed = coach.followedAthleteIds;
    if (followed == null || !chosen("coach", coach.userId)) return [];
    const athleteNames = athletes
      .filter((athlete) => !followed.includes(athlete.userId))
      .map((athlete) => athlete.name);
    return athleteNames.length === 0
      ? []
      : [{ coachId: coach.userId, coachName: coach.name, athleteNames }];
  });

  return { athletesSeeEachOther: athletes.length >= 2, unfollowed };
}

/**
 * Le nom de chaque participant choisi, dans l'ordre du choix — les pastilles du sélecteur. Un choix
 * dont le candidat a disparu (liste relue entre-temps) est écarté : il n'a plus de nom à montrer,
 * et l'API le refuserait de toute façon.
 */
export function selectedCandidates(
  candidates: ConversationCandidatesDto,
  selection: readonly ParticipantRef[],
): (ParticipantRef & { name: string })[] {
  return selection.flatMap((ref) => {
    const pool = ref.capability === "athlete" ? candidates.athletes : candidates.coaches;
    const candidate = pool.find((person) => person.userId === ref.userId);
    return candidate == null ? [] : [{ ...ref, name: candidate.name }];
  });
}

/**
 * Une ligne du sélecteur de participants. `organizations` : les entreprises du Coach, jointes —
 * la provenance du lien côté athlète (« via F »), les entreprises communes côté Coach ; `null`
 * pour un athlète ou un lien direct, que la ligne dit par la seule capacité.
 */
export type CandidateRow = ParticipantRef & { name: string; organizations: string | null };

/** Les candidats en lignes à cocher, athlètes puis Coachs — même rendu sur le web et le mobile. */
export function candidateRows(candidates: ConversationCandidatesDto): {
  athletes: CandidateRow[];
  coaches: CandidateRow[];
} {
  return {
    athletes: candidates.athletes.map((athlete) => ({
      userId: athlete.userId,
      capability: "athlete",
      name: athlete.name,
      organizations: null,
    })),
    coaches: candidates.coaches.map((coach) => ({
      userId: coach.userId,
      capability: "coach",
      name: coach.name,
      organizations:
        coach.organizationNames.length === 0 ? null : coach.organizationNames.join(", "),
    })),
  };
}

/**
 * La liste en cache, augmentée d'une conversation tout juste ouverte si elle n'y est pas encore :
 * le fil se retrouve par son id DANS la liste, et une conversation créée n'y serait qu'à la relecture.
 * En tête, là où l'API trie une conversation vide (à sa création). Inchangée sinon — même référence,
 * pour que le cache ne notifie personne. Rien en cache, rien de fabriqué : une liste réduite à
 * cette seule conversation passerait pour la liste chargée, le temps que la vraie arrive.
 */
export function withConversation(
  list: ConversationDto[] | undefined,
  conversation: ConversationDto,
): ConversationDto[] | undefined {
  if (list == null || list.some((listed) => listed.id === conversation.id)) return list;
  return [conversation, ...list];
}
