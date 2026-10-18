import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ConversationThread, ThreadHeader } from "@/feature/message/component/ConversationThread";
import { useConversation } from "@/feature/message/hook/useConversation";
import { CmvErrorState, CmvScreen } from "@/shared/component";

/**
 * Une conversation, désignée par son id (#612) : depuis la liste, une notification, « Mes coachs »
 * ou l'écran de création. Elle se lit dans MA liste, qui porte ses participants et ma marque de
 * lecture — rien à résoudre ici, contrairement au fil par interlocuteur d'avant.
 *
 * Absente d'une liste chargée, elle est relue une fois : une conversation ouverte par un autre
 * participant peut précéder la relecture de la liste. Toujours absente APRÈS cette relecture,
 * c'est une panne à dire — pas un fil vide, qui inviterait à écrire dans une conversation qu'on
 * n'a pas. Avant, on attend : la dire au premier rendu la ferait clignoter.
 */
export function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { conversation, conversations } = useConversation(conversationId);

  const missing = conversation === null;
  const [rechecked, setRechecked] = useState(false);
  const { refetch } = conversations;
  useEffect(() => {
    if (!missing) return;
    void refetch().then(() => setRechecked(true));
  }, [missing, refetch]);

  if (conversation != null) return <ConversationThread conversation={conversation} />;

  return (
    <CmvScreen>
      <ThreadHeader conversation={null} />
      {conversations.isError || (missing && rechecked) ? (
        <View className="p-4">
          <CmvErrorState onRetry={() => conversations.refetch()} />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      )}
    </CmvScreen>
  );
}
