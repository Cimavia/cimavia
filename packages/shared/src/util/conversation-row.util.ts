import type { TrainingCapability } from "../capability";
import type { ConversationDto } from "../dto/message.schema";

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
 * Ordre : les fils les plus récemment actifs d'abord, puis les interlocuteurs sans échange, dans
 * l'ordre de leurs relations (le tri est stable).
 */
export function conversationRows(
  relations: readonly ConversationRelation[],
  conversations: readonly ConversationDto[],
  as: TrainingCapability,
): ConversationRow[] {
  const byCounterpart = new Map(
    conversations.map((conversation) => [conversation.counterpartId, conversation]),
  );
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
    .sort((a, b) =>
      (b.conversation?.lastMessageAt ?? "").localeCompare(a.conversation?.lastMessageAt ?? ""),
    );
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
