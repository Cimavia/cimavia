import {
  type ConversationDto,
  conversationPreviewText,
  conversationTitle,
  hasCandidates as hasAnyone,
  type TrainingCapability,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { type ReactNode, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { ParticipantAvatars } from "@/feature/message/component/ParticipantAvatars";
import {
  useConversationCandidates,
  useConversations,
} from "@/feature/message/hook/useConversation";
import { useUnreadByCapability } from "@/feature/notification/hook/useNotifications";
import {
  CmvButton,
  CmvCapabilitySwitch,
  CmvErrorState,
  CmvScreen,
  CmvText,
} from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
import { authClient } from "@/shared/lib/auth";
import { formatRelativeTime } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values messages.noConversations: coach, athlete

/**
 * L'onglet Messages, servi aux deux titres (CDC §5.8) : une ligne par CONVERSATION, à deux ou à
 * plusieurs (#612). Un interlocuteur jamais contacté n'a pas de ligne — on lui écrit par
 * « Nouvelle conversation » (tranché en #612).
 *
 * Un seul écran pour les deux titres, là où #599 en tenait deux : la liste et les candidats
 * (`GET /conversations/candidates`) se lisent par les mêmes routes, au titre exercé.
 */
export function MessagesScreen() {
  const { t } = useTranslation();
  const as = useActingCapability();
  const { data: session } = authClient.useSession();
  const conversations = useConversations();
  const candidates = useConversationCandidates();
  // Même clé de cache pour tous les appelants : une seule requête, quel que soit le nombre
  // d'écrans qui affichent le sélecteur.
  const { data: unread } = useUnreadByCapability();

  /**
   * Relue à chaque passage au premier plan : le cache est persisté et frais 5 min, donc un message
   * arrivé pendant qu'on regardait ailleurs n'y apparaîtrait qu'au tirer-pour-rafraîchir (#309).
   * Pas de sondage — on ne regarde pas cette liste changer.
   */
  const { refetch: refetchConversations } = conversations;
  useFocusEffect(
    useCallback(() => {
      void refetchConversations();
    }, [refetchConversations]),
  );

  /**
   * Une notification ouvre le fil par son id (`?conversation=`), comme la route d'un fil depuis
   * #612 — une fois la liste RELUE, et seulement si elle la porte : notifiée à l'autre titre, la
   * conversation n'est pas de cet espace, et le fil dirait une panne. On reste alors sur la liste,
   * où le sélecteur d'espace montre sa pastille. Le paramètre est CONSOMMÉ avant la navigation —
   * sinon revenir du fil le rouvrirait.
   */
  const { conversation: notified } = useLocalSearchParams<{ conversation?: string }>();
  const settled = conversations.isFetching ? undefined : conversations.data;
  useEffect(() => {
    if (notified == null || settled == null) return;
    router.setParams({ conversation: undefined });
    if (settled.some((conversation) => conversation.id === notified)) {
      router.push(`/messages/${notified}`);
    }
  }, [notified, settled]);

  const hasCandidates = hasAnyone(candidates.data);
  const isPending = conversations.isPending || candidates.isPending;
  const isError = conversations.isError || candidates.isError;
  const list = conversations.data ?? [];
  const refresh = () => {
    conversations.refetch();
    candidates.refetch();
  };

  return (
    <CmvScreen>
      <OfflineBanner />

      <View className="flex-row items-center justify-between gap-2 px-4 pt-4">
        <CmvText className="shrink font-cmv-display text-cmv-text-hi text-xl">
          {t("messages.title")}
        </CmvText>
        {/* À droite du titre : il le qualifie, il ne filtre pas la liste. */}
        <CmvCapabilitySwitch unread={unread} />
      </View>

      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-4 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={conversations.isRefetching || candidates.isRefetching}
            onRefresh={refresh}
            // Le spinner est natif : il ignore les className, d'où la valeur (issue des tokens).
            tintColor={cmvColors.accent.DEFAULT}
          />
        }
      >
        {/* Sans personne à réunir, il n'y a rien à créer (#598, E1) : le bouton n'est pas proposé. */}
        {hasCandidates ? (
          <CmvButton
            label={t("messages.newConversation")}
            onPress={() => router.push("/messages/new")}
          />
        ) : null}

        {isPending ? <ActivityIndicator /> : null}
        {/* Trois états distincts, jamais confondus : « personne à qui écrire » sur une panne réseau
            serait un mensonge. */}
        {isError ? <CmvErrorState onRetry={refresh} /> : null}

        {!isPending && !isError && list.length === 0 ? (
          <NoConversation as={as} hasCandidates={hasCandidates} />
        ) : null}

        {isError
          ? null
          : list.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                currentUserId={session?.user.id ?? null}
              />
            ))}
      </ScrollView>
    </CmvScreen>
  );
}

/**
 * Aucune conversation : sans personne à réunir, le dire et renvoyer vers ce qui y remédie ; sinon,
 * inviter à la première (#598, E1 et E2).
 */
function NoConversation({
  as,
  hasCandidates,
}: Readonly<{ as: TrainingCapability; hasCandidates: boolean }>) {
  const { t } = useTranslation();

  if (hasCandidates) {
    return (
      <EmptyCard
        title={t("messages.noConversations.title")}
        description={t(`messages.noConversations.${as}`)}
      />
    );
  }
  if (as === "coach") {
    return (
      <EmptyCard
        title={t("messages.noAthletes.title")}
        description={t("messages.noAthletes.description")}
      />
    );
  }
  // On garde le chemin vers « Mes coachs », seul accès aux invitations — la planche l'avait retiré.
  return (
    <EmptyCard title={t("messages.noCoach.title")} description={t("messages.noCoach.description")}>
      <CmvButton label={t("messages.noCoach.action")} onPress={() => router.push("/join")} />
    </EmptyCard>
  );
}

function EmptyCard({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children?: ReactNode }>) {
  return (
    <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
      <CmvText className="text-cmv-text-hi">{title}</CmvText>
      <CmvText className="text-cmv-text-mid text-sm">{description}</CmvText>
      {children}
    </View>
  );
}

function ConversationRow({
  conversation,
  currentUserId,
}: Readonly<{ conversation: ConversationDto; currentUserId: string | null }>) {
  const { t } = useTranslation();
  const unread = conversation.unreadCount;

  return (
    <Pressable
      onPress={() => router.push(`/messages/${conversation.id}`)}
      className="flex-row items-center gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3"
    >
      <ParticipantAvatars participants={conversation.participants} max={2} />

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <CmvText className="flex-1 text-cmv-text-hi" numberOfLines={1}>
            {conversationTitle(conversation) ?? "—"}
          </CmvText>
          {/* `null` = aucun échange : pas de date inventée. */}
          <CmvText className="text-cmv-text-lo text-xs">
            {conversation.lastMessageAt == null
              ? "—"
              : formatRelativeTime(conversation.lastMessageAt)}
          </CmvText>
        </View>
        <CmvText className="text-cmv-text-lo text-xs" numberOfLines={1}>
          {/* `null` : conversation encore vide (#598, E3). */}
          {conversationPreviewText(conversation, currentUserId, t) ?? "—"}
        </CmvText>
      </View>

      {unread === 0 ? null : (
        <View className="h-6 min-w-6 items-center justify-center rounded-full bg-cmv-accent px-2">
          <CmvText className="text-cmv-accent-fg text-xs">{unread}</CmvText>
        </View>
      )}
    </Pressable>
  );
}
