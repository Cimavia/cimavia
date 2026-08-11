import { useLocalSearchParams } from "expo-router";
import { ConversationThread } from "@/feature/message/component/ConversationThread";
import { useConversationWith } from "@/feature/message/hook/useConversation";

/**
 * Le fil du coach avec UN athlète. Cet écran ne fait que résoudre le fil (get-or-create) ; le rendu
 * est celui de l'athlète, à l'identique — un fil 1:1 se lit pareil des deux bouts.
 */
export function CoachConversationScreen() {
  const { athleteId } = useLocalSearchParams<{ athleteId: string }>();
  const conversation = useConversationWith(athleteId);

  return (
    <ConversationThread
      conversationId={conversation.data?.id}
      isResolving={conversation.isPending}
      hasResolveError={conversation.isError}
      onRetryResolve={() => conversation.refetch()}
    />
  );
}
