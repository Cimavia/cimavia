import type { TrainingCapability } from "../capability";
import { type ConversationDto, ConversationKind } from "../dto/message.schema";

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
