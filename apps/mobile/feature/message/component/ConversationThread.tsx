import {
  type ConversationDto,
  conversationSubtitleText,
  conversationTitle,
  createReadMarker,
  emptyThreadText,
  lastUnreadIncomingId,
  type MediaRecapLine,
  mediaRecapText,
  readByOf,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { messageKeys } from "@/feature/message/api";
import { Composer } from "@/feature/message/component/Composer";
import { MessageList } from "@/feature/message/component/MessageList";
import { ParticipantAvatars } from "@/feature/message/component/ParticipantAvatars";
import { MESSAGE_MEDIA_PROFILE } from "@/feature/message/constant";
import { useMarkRead, useMessages, useSendMessage } from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { useExercisedCapability } from "@/shared/hook/useExercisedCapability";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { authClient } from "@/shared/lib/auth";
import { mediaErrorMessage } from "@/shared/util/media.util";

type ConversationThreadProps = {
  /**
   * La conversation telle que la liste la porte, DÉJÀ trouvée par l'écran : ses participants font
   * l'en-tête, et c'est elle qui suit MA marque de lecture (#611) — `markRead` l'invalide.
   */
  conversation: ConversationDto;
};

/**
 * L'en-tête d'un fil (#612, planche M3) : le retour à la liste, les pastilles, le titre et ce qui le
 * qualifie. Sans conversation (elle charge, ou n'a pas été trouvée), le retour seul — on ne devine
 * ni titre ni participants.
 */
export function ThreadHeader({ conversation }: Readonly<{ conversation: ConversationDto | null }>) {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center gap-3 border-cmv-border border-b px-4 py-3">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("messages.back")}
        className="rounded-lg border border-cmv-border bg-cmv-surface p-2"
      >
        <Ionicons name="chevron-back" size={18} color={cmvColors.text.hi} />
      </Pressable>
      {conversation == null ? null : (
        <>
          <ParticipantAvatars participants={conversation.participants} max={3} />
          <View className="flex-1">
            <CmvText className="font-cmv-display text-cmv-text-hi" numberOfLines={1}>
              {conversationTitle(conversation) ?? "—"}
            </CmvText>
            <CmvText className="text-cmv-text-mid text-xs">
              {conversationSubtitleText(conversation, t) ?? "—"}
            </CmvText>
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Une conversation, à deux ou à plusieurs, quel que soit le bout par lequel on la regarde
 * (CDC §5.8). Asynchrone : les nouveaux messages remontent par polling (10 s au premier plan) +
 * push. Écrire exige le réseau — pas d'envoi différé en MVP, et un échec se dit plutôt que de se
 * masquer.
 *
 * À plusieurs (#612), chaque bulle reçue porte son auteur, et « Lu par » suit mon dernier message.
 */
export function ConversationThread({ conversation }: Readonly<ConversationThreadProps>) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();

  const conversationId = conversation.id;
  const messages = useMessages(conversationId);
  const freshMediaUrl = useFreshMediaUrl(
    messageKeys.thread(conversationId, useExercisedCapability()),
  );
  const send = useSendMessage(conversationId);
  // On ne garde que `mutate`, garanti stable par TanStack Query : la stabilité devient vérifiable
  // par le linter au lieu de reposer sur un commentaire.
  const { mutate: markRead } = useMarkRead(conversationId);
  const media = useSendMessageMedia(conversationId);

  // Refus qui précède l'upload (permission galerie, permission/erreur micro) : porté à la main car
  // il ne passe pas par la mutation. Réinitialisé à chaque nouvelle tentative.
  const [preUploadErrorKey, setPreUploadErrorKey] = useState<string | null>(null);

  // Ce qui n'a pas été envoyé au dernier lot, fichier par fichier (#156).
  const [recap, setRecap] = useState<readonly MediaRecapLine[]>([]);

  const currentUserId = session?.user.id ?? null;
  const items = messages.data ?? [];
  const mediaError = mediaErrorMessage(
    media.audioError,
    preUploadErrorKey,
    t,
    MESSAGE_MEDIA_PROFILE,
  );

  // Marque lu à CHAQUE nouvel entrant, repéré par son id (#305) : la règle et son pourquoi vivent
  // dans `message-read.util`. `markRead` n'invalide que la conversation (pas les messages) : pas
  // de boucle.
  const unreadTarget = lastUnreadIncomingId(items, currentUserId, conversation.lastReadAt);
  const readBy = readByOf(conversation, items, currentUserId);
  const [readMarker] = useState(createReadMarker);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages.dataUpdatedAt` est un déclencheur, pas une donnée lue — chaque sondage redonne sa chance à un marquage en échec.
  useEffect(() => {
    if (unreadTarget == null || !readMarker.claim(unreadTarget)) return;
    markRead(undefined, { onError: () => readMarker.release(unreadTarget) });
  }, [conversationId, unreadTarget, readMarker, markRead, messages.dataUpdatedAt]);

  if (messages.isError) {
    return (
      <CmvScreen>
        <ThreadHeader conversation={conversation} />
        <View className="p-4">
          <CmvErrorState onRetry={() => messages.refetch()} />
        </View>
      </CmvScreen>
    );
  }

  if (messages.isPending) {
    return (
      <CmvScreen>
        <ThreadHeader conversation={conversation} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
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
        <ThreadHeader conversation={conversation} />
        {items.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 p-6">
            <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
              {t("messages.empty.title")}
            </CmvText>
            <CmvText className="text-center text-cmv-text-mid">
              {emptyThreadText(conversation, t)}
            </CmvText>
          </View>
        ) : (
          <View className="flex-1">
            <MessageList
              conversation={conversation}
              messages={items}
              currentUserId={currentUserId}
              readBy={readBy}
              resolveMediaUrl={freshMediaUrl}
            />
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
          onSendText={(content) => send.mutateAsync({ type: "TEXT", content })}
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
