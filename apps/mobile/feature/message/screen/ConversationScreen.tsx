import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useMyCoach } from "@/feature/coach/hook/useMyCoach";
import { ConversationThread } from "@/feature/message/component/ConversationThread";
import { useMyConversation } from "@/feature/message/hook/useConversation";
import { CmvScreen, CmvText } from "@/shared/component";

/**
 * Le fil de l'ATHLÈTE avec son coach : il n'en a qu'un (invariant multi-tenant), donc pas de liste
 * à parcourir avant.
 *
 * Cet écran ne fait que RÉSOUDRE le fil ; le rendu vit dans `ConversationThread`, partagé avec le
 * coach. Sans coach, il n'y a rien à ouvrir — l'API refuserait —, et le dire vaut mieux qu'un fil
 * vide sans explication.
 */
export function ConversationScreen() {
  const { t } = useTranslation();
  const { data: coach } = useMyCoach();
  const hasCoach = coach != null;
  const conversation = useMyConversation(hasCoach);

  if (!hasCoach) {
    return (
      <CmvScreen>
        <View className="flex-1 items-center justify-center gap-2 p-6">
          <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
            {t("messages.noCoach.title")}
          </CmvText>
          <CmvText className="text-center text-cmv-text-mid">
            {t("messages.noCoach.description")}
          </CmvText>
        </View>
      </CmvScreen>
    );
  }

  return (
    <ConversationThread
      conversationId={conversation.data?.id}
      isResolving={conversation.isPending}
      hasResolveError={conversation.isError}
      onRetryResolve={() => conversation.refetch()}
    />
  );
}
