import type { MediaRecapLine } from "@cmv/shared";
import { mediaRecapText } from "@cmv/shared";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Composer } from "@/feature/message/component/Composer";
import { MessageList } from "@/feature/message/component/MessageList";
import { useMarkRead, useMessages, useSendMessage } from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";
import { mediaErrorMessage } from "@/feature/message/util/media.util";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

type ConversationThreadProps = {
  /**
   * Le fil DÉJÀ résolu par l'appelant. C'est lui qui sait comment : l'athlète ouvre le sien avec
   * son coach, le coach celui d'un athlète désigné. Résoudre ici obligerait ce composant à
   * connaître les deux rôles pour n'en servir qu'un à la fois — et à appeler `GET /me/coach`, que
   * l'API refuse à un coach.
   */
  conversationId: string | undefined;
  isResolving: boolean;
  hasResolveError: boolean;
  onRetryResolve: () => void;
  /**
   * Bandeau facultatif rendu au-dessus du fil. Sert au sélecteur de titre côté athlète (#129) :
   * l'onglet Messages y montre le fil directement, sans liste intermédiaire, donc sans autre
   * endroit où le poser.
   */
  header?: ReactNode;
};

/**
 * Un fil 1:1, quel que soit le bout par lequel on le regarde (CDC §5.8). Asynchrone : les nouveaux
 * messages remontent par polling (10 s au premier plan) + push. Écrire exige le réseau — pas
 * d'envoi différé en MVP, et un échec se dit plutôt que de se masquer.
 */
export function ConversationThread({
  conversationId,
  isResolving,
  hasResolveError,
  onRetryResolve,
  header,
}: Readonly<ConversationThreadProps>) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();

  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId ?? "");
  // On ne garde que `mutate`, garanti stable par TanStack Query : la stabilité devient vérifiable
  // par le linter au lieu de reposer sur un commentaire.
  const { mutate: markRead } = useMarkRead(conversationId);
  const media = useSendMessageMedia(conversationId ?? "");

  // Refus qui précède l'upload (permission galerie, permission/erreur micro) : porté à la main car
  // il ne passe pas par la mutation. Réinitialisé à chaque nouvelle tentative.
  const [preUploadErrorKey, setPreUploadErrorKey] = useState<string | null>(null);

  // Ce qui n'a pas été envoyé au dernier lot, fichier par fichier (#156).
  const [recap, setRecap] = useState<readonly MediaRecapLine[]>([]);

  const currentUserId = session?.user.id ?? "";
  const items = messages.data ?? [];
  const mediaError = mediaErrorMessage(media.audioError, preUploadErrorKey, t);

  // Marque lu dès qu'un message entrant non lu apparaît. `markRead` n'invalide que la conversation
  // (pas les messages) : le prochain poll ramène `readAt` posé et la condition retombe — pas de
  // boucle.
  const hasIncomingUnread = items.some(
    (message) => message.senderId !== currentUserId && message.readAt == null,
  );
  useEffect(() => {
    if (conversationId != null && hasIncomingUnread) {
      markRead();
    }
  }, [conversationId, hasIncomingUnread, markRead]);

  if (isResolving || messages.isPending) {
    return (
      <CmvScreen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </CmvScreen>
    );
  }

  if (hasResolveError || messages.isError) {
    return (
      <CmvScreen>
        <CmvErrorState
          onRetry={() => (conversationId == null ? onRetryResolve() : messages.refetch())}
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
        {header != null && <View className="flex-row justify-end px-4 pt-4">{header}</View>}
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

        {/* Une ligne PAR fichier : « 2 sur 5 n'ont pas pu partir » ne dirait pas lesquels, ce qui
            laisserait la sélection entière à refaire. La clé est le rang du fichier dans la
            sélection, porté par la ligne. */}
        {recap.map((entry) => (
          <CmvText key={entry.id} className="px-4 pb-1 text-cmv-error text-sm">
            {`${entry.fileName ?? t("messages.media.unnamedFile")} — ${mediaRecapText(entry.reason, t)}`}
          </CmvText>
        ))}

        <Composer
          onSendText={(content) => send.mutate({ type: "TEXT", content })}
          onPickMedia={() => {
            setPreUploadErrorKey(null);
            setRecap([]);
            void media.pickAndSend(setPreUploadErrorKey).then(setRecap);
          }}
          onRecordAudio={(audio) => {
            setPreUploadErrorKey(null);
            media.recordAndSend(audio);
          }}
          onMediaError={setPreUploadErrorKey}
          sending={send.isPending}
          mediaBusy={media.isUploading}
          step={media.step}
        />
      </KeyboardAvoidingView>
    </CmvScreen>
  );
}
