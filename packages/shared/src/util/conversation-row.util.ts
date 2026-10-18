import type { TrainingCapability } from "../capability";
import { type ConversationDto, ConversationKind } from "../dto/message.schema";

/** Ce dont une ligne dépend dans une relation : les deux bouts, et si c'est soi. */
export type ConversationRelation = {
  coachId: string;
  coachName: string;
  athleteId: string;
  athleteName: string;
  isSelf: boolean;
};

export type ConversationRow = {
  /** L'autre bout du fil : un athlète pour le coach, un coach pour l'athlète. */
  counterpartId: string;
  counterpartName: string;
  /** `null` = jamais d'échange : le fil se crée à la première ouverture (get-or-create). */
  conversation: ConversationDto | null;
};

/** Ce dont la jointure a besoin d'une conversation : sa forme et ceux qu'elle réunit. */
export type DirectConversationSource = Pick<ConversationDto, "kind" | "participants">;

/**
 * L'interlocuteur d'une conversation À DEUX, s'il participe à ce titre — ou `null` : une
 * conversation à plusieurs n'a pas d'interlocuteur, et un fil Coach ↔ Coach n'est pas celui d'un
 * athlète (#611).
 *
 * C'est la seule jointure entre une relation et sa conversation : une ligne « athlète » ne doit
 * jamais ouvrir le fil de C avec M, même si M est aussi l'un de ses athlètes ailleurs.
 */
export function directCounterpartId(
  conversation: DirectConversationSource,
  capability: TrainingCapability,
): string | null {
  if (conversation.kind !== ConversationKind.DIRECT) return null;
  const [counterpart] = conversation.participants;
  return counterpart?.capability === capability ? counterpart.userId : null;
}

/** Quand la conversation a bougé pour la dernière fois : son dernier message, sinon sa création. */
function activityOf(conversation: ConversationDto | null): string {
  return conversation == null ? "" : (conversation.lastMessageAt ?? conversation.createdAt);
}

/**
 * La liste des fils d'une messagerie, au titre exercé (#599) : une ligne par relation, **qu'un fil
 * existe ou non**. On part des relations et non des conversations : un interlocuteur sans échange
 * serait sinon injoignable.
 *
 * Écrite une fois pour les deux côtés et les deux plateformes : le coach liste ses athlètes depuis
 * #34, l'athlète ses coachs depuis qu'il peut en avoir plusieurs. Seul change le bout qu'on nomme.
 *
 * L'entrée SYNTHÉTIQUE de l'auto-coaching est écartée ici, et ici seulement (#198) : elle reste
 * sur `GET /athletes`, dont le builder et le tableau de bord dépendent (#14). Le fil `(soi, soi)`
 * ne peut pas exister, et la ligne menait à un écran d'erreur.
 *
 * Seuls les fils À DEUX avec un interlocuteur de l'autre capacité y trouvent leur ligne : les
 * conversations à plusieurs et les fils entre Coachs attendent leurs écrans (#612).
 *
 * Ordre : les fils les plus récemment actifs d'abord — un fil encore vide compte à sa création —,
 * puis les interlocuteurs sans fil, dans l'ordre de leurs relations (le tri est stable).
 */
export function conversationRows(
  relations: readonly ConversationRelation[],
  conversations: readonly ConversationDto[],
  as: TrainingCapability,
): ConversationRow[] {
  const counterpartCapability = as === "coach" ? "athlete" : "coach";
  const byCounterpart = new Map<string, ConversationDto>();
  for (const conversation of conversations) {
    const counterpartId = directCounterpartId(conversation, counterpartCapability);
    if (counterpartId != null) byCounterpart.set(counterpartId, conversation);
  }
  return relations
    .filter((relation) => !relation.isSelf)
    .map((relation) => {
      const counterpartId = as === "coach" ? relation.athleteId : relation.coachId;
      return {
        counterpartId,
        counterpartName: as === "coach" ? relation.athleteName : relation.coachName,
        conversation: byCounterpart.get(counterpartId) ?? null,
      };
    })
    .sort((a, b) => activityOf(b.conversation).localeCompare(activityOf(a.conversation)));
}

/**
 * L'interlocuteur du fil que désigne `conversationId`, ou `null` tant qu'on ne le connaît pas.
 *
 * Une notification de message ne porte que l'id de la conversation, alors que la messagerie
 * sélectionne par interlocuteur (#599) : c'est la traduction. `null` aussi pour un fil inconnu de
 * la liste — ouvrir la messagerie sans sélection vaut mieux que deviner.
 */
export function counterpartOfConversation(
  rows: readonly ConversationRow[],
  conversationId: string | undefined,
): string | null {
  if (conversationId == null) return null;
  return rows.find((row) => row.conversation?.id === conversationId)?.counterpartId ?? null;
}
