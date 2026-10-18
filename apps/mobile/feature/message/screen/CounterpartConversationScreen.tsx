import { readMarkOf } from "@cmv/shared";
import { useLocalSearchParams } from "expo-router";
import { ConversationThread } from "@/feature/message/component/ConversationThread";
import {
  useConversations,
  useConversationWith,
  useConversationWithCoach,
} from "@/feature/message/hook/useConversation";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";

/**
 * Le fil avec UN interlocuteur, désigné par l'url : un athlète pour le coach, un de ses coachs pour
 * l'athlète (#599). Cet écran ne fait que résoudre le fil (get-or-create) ; le rendu est le même
 * des deux bouts — un fil à deux se lit pareil de chaque côté.
 *
 * Les deux résolutions sont appelées inconditionnellement (règle des hooks) ; c'est le titre
 * exercé qui décide laquelle part, l'autre restant à `null` — donc inerte.
 */
export function CounterpartConversationScreen() {
  const { counterpartId } = useLocalSearchParams<{ counterpartId: string }>();
  const isCoach = useActingCapability() === "coach";
  const withAthlete = useConversationWith(isCoach ? counterpartId : null);
  const withCoach = useConversationWithCoach(isCoach ? null : counterpartId);
  const conversation = isCoach ? withAthlete : withCoach;
  // Ma marque de lecture suit la liste des fils, que `markRead` invalide (#611) : `readMarkOf`.
  // Pas de requête de plus d'ordinaire : la liste des fils, montée sous ce fil dans la pile de
  // l'onglet Messages, la tient déjà en cache et la relit après chaque `markRead`.
  const listed = useConversations().data?.find((row) => row.id === conversation.data?.id);

  return (
    <ConversationThread
      conversationId={conversation.data?.id}
      lastReadAt={readMarkOf(listed, conversation.data)}
      isResolving={conversation.isPending}
      hasResolveError={conversation.isError}
      onRetryResolve={() => conversation.refetch()}
    />
  );
}
