import { useLocalSearchParams } from "expo-router";
import { ConversationThread } from "@/feature/message/component/ConversationThread";
import {
  useConversationWith,
  useConversationWithCoach,
} from "@/feature/message/hook/useConversation";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";

/**
 * Le fil avec UN interlocuteur, désigné par l'url : un athlète pour le coach, un de ses coachs pour
 * l'athlète (#599). Cet écran ne fait que résoudre le fil (get-or-create) ; le rendu est le même
 * des deux bouts — un fil 1:1 se lit pareil de chaque côté.
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

  return (
    <ConversationThread
      conversationId={conversation.data?.id}
      isResolving={conversation.isPending}
      hasResolveError={conversation.isError}
      onRetryResolve={() => conversation.refetch()}
    />
  );
}
