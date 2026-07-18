import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useMyCoach } from "@/feature/coach/hook/useMyCoach";
import { Composer } from "@/feature/message/component/Composer";
import { MessageList } from "@/feature/message/component/MessageList";
import {
  useMarkRead,
  useMessages,
  useMyConversation,
  useSendMessage,
} from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";
import { MediaRejectedError } from "@/feature/message/util/media.util";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { authClient } from "@/shared/lib/auth";

/**
 * Un refus métier (fichier trop lourd, permission) porte sa clé i18n ; une panne technique garde
 * le message de l'API. Les deux se disent — aucune ne se masque.
 */
function mediaErrorMessage(error: unknown, manualKey: string | null, t: TFunction): string | null {
  if (manualKey != null) return t(manualKey);
  if (error == null) return null;
  if (error instanceof MediaRejectedError) return t(error.reasonKey);
  return apiErrorMessage(error) ?? t("messages.media.uploadError");
}

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
  const media = useSendMessageMedia(conversationId ?? "");

  // Refus qui précède l'upload (permission galerie, permission/erreur micro) : porté à la main car
  // il ne passe pas par la mutation. Réinitialisé à chaque nouvelle tentative.
  const [preUploadErrorKey, setPreUploadErrorKey] = useState<string | null>(null);

  const currentUserId = session?.user.id ?? "";
  const items = messages.data ?? [];
  const mediaBusy = media.isUploading;
  const mediaError = mediaErrorMessage(media.uploadError, preUploadErrorKey, t);

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
      {/* KeyboardAvoidingView de react-native-keyboard-controller (pas celui de RN) : il gère
          Android edge-to-edge, là où le natif reste inerte. La barre d'onglets se masque en
          parallèle (tabBarHideOnKeyboard) → le composer vient pile au-dessus du clavier.
          `style` (et non className) : la vue vient d'une lib tierce, on ne dépend pas de NativeWind
          pour un simple flex:1 (aucune couleur/token ici). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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

        {mediaError != null ? (
          <CmvText className="px-4 pb-1 text-cmv-error text-sm">{mediaError}</CmvText>
        ) : null}

        <Composer
          onSendText={(content) => send.mutate({ type: "TEXT", content })}
          onPickMedia={() => {
            setPreUploadErrorKey(null);
            media.pickAndSend(setPreUploadErrorKey);
          }}
          onRecordAudio={(audio) => {
            setPreUploadErrorKey(null);
            media.recordAndSend(audio);
          }}
          onMediaError={setPreUploadErrorKey}
          sending={send.isPending}
          mediaBusy={mediaBusy}
        />
      </KeyboardAvoidingView>
    </CmvScreen>
  );
}
