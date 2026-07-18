import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from "react-native";
import { useMyCoach } from "@/feature/coach/hook/useMyCoach";
import { Composer } from "@/feature/message/component/Composer";
import { MessageList } from "@/feature/message/component/MessageList";
import {
  useMarkRead,
  useMessages,
  useMyConversation,
  useSendMessage,
} from "@/feature/message/hook/useConversation";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/**
 * Fil de messagerie de l'athlète avec son coach (CDC §5.8). Asynchrone : les nouveaux messages
 * remontent par polling (10 s au premier plan) + push. Écrire exige le réseau (pas d'envoi
 * différé en MVP) — un échec se dit, il ne se masque pas.
 */
export function ConversationScreen() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const { data: coach } = useMyCoach();
  const hasCoach = coach != null;

  const conversation = useMyConversation(hasCoach);
  const conversationId = conversation.data?.id;
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId ?? "");
  const markRead = useMarkRead(conversationId);

  const currentUserId = session?.user.id ?? "";
  const items = messages.data ?? [];

  // Marque lu dès qu'un message entrant non lu apparaît. `markRead` n'invalide que la conversation
  // (pas les messages) : le prochain poll ramène `readAt` posé et la condition retombe — pas de
  // boucle. `mutate` est stable, on peut l'omettre des dépendances.
  const hasIncomingUnread = items.some(
    (message) => message.senderId !== currentUserId && message.readAt == null,
  );
  useEffect(() => {
    if (conversationId != null && hasIncomingUnread) {
      markRead.mutate();
    }
  }, [conversationId, hasIncomingUnread]);

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

  if (conversation.isPending || messages.isPending) {
    return (
      <CmvScreen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </CmvScreen>
    );
  }

  if (conversation.isError || messages.isError) {
    return (
      <CmvScreen>
        <CmvErrorState
          onRetry={() => (conversationId == null ? conversation : messages).refetch()}
        />
      </CmvScreen>
    );
  }

  return (
    <CmvScreen>
      <KeyboardAvoidingView
        className="flex-1"
        // iOS pousse le contenu (padding), Android réduit la hauteur de la vue (height) : sans
        // `behavior` explicite, le composant est INERTE sur Android et le champ reste sous le
        // clavier. La barre d'onglets est masquée en parallèle (tabBarHideOnKeyboard) → offset 0.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {items.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 p-6">
            <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
              {t("messages.empty.title")}
            </CmvText>
            <CmvText className="text-center text-cmv-text-mid">
              {t("messages.empty.description")}
            </CmvText>
          </View>
        ) : (
          <View className="flex-1">
            <MessageList messages={items} currentUserId={currentUserId} />
          </View>
        )}

        {send.isError ? (
          <CmvText className="px-4 pb-1 text-cmv-error text-sm">{t("messages.sendError")}</CmvText>
        ) : null}

        <Composer
          onSend={(content) => send.mutate({ type: "TEXT", content })}
          sending={send.isPending}
        />
      </KeyboardAvoidingView>
    </CmvScreen>
  );
}
