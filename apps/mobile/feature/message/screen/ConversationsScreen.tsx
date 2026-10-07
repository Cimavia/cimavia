import {
  type CapabilityName,
  type ConversationDto,
  type ConversationRelation,
  conversationRows,
  counterpartOfConversation,
  initialsOf,
  MessageType,
  type ConversationRow as Row,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import type { UseQueryResult } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useAthletes } from "@/feature/athlete";
import { useMyCoaches } from "@/feature/coach/hook/useMyCoach";
import { useConversations } from "@/feature/message/hook/useConversation";
import { useUnreadByCapability } from "@/feature/notification/hook/useNotifications";
import { CmvCapabilitySwitch, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatRelativeTime } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values messages.preview: IMAGE, VIDEO, AUDIO, FEEDBACK_CREATED, FEEDBACK_UPDATED

/** La liste des fils du coach (#34) : un par athlète TIERS, qu'un fil existe ou non. */
export function CoachConversationsScreen() {
  const { t } = useTranslation();
  return (
    <ConversationsView
      as="coach"
      relations={useAthletes()}
      emptyTitle={t("messages.noAthletes.title")}
      emptyDescription={t("messages.noAthletes.description")}
    />
  );
}

/**
 * La liste des fils de l'athlète (#599) : un par coach qui le suit. Sans coach, il n'y a rien à
 * ouvrir — l'API refuserait —, et le dire vaut mieux qu'une liste vide sans explication.
 */
export function AthleteConversationsScreen() {
  const { t } = useTranslation();
  return (
    <ConversationsView
      as="athlete"
      relations={useMyCoaches()}
      emptyTitle={t("messages.noCoach.title")}
      emptyDescription={t("messages.noCoach.description")}
    />
  );
}

type ConversationsViewProps = {
  as: CapabilityName;
  relations: UseQueryResult<ConversationRelation[]>;
  emptyTitle: string;
  emptyDescription: string;
};

/**
 * Une ligne par interlocuteur, **qu'un fil existe ou non** : sélectionner un interlocuteur jamais
 * contacté crée le fil à la volée (get-or-create). Les lignes se construisent dans
 * `conversationRows` (@cmv/shared), la même fusion que côté web.
 */
function ConversationsView({
  as,
  relations,
  emptyTitle,
  emptyDescription,
}: Readonly<ConversationsViewProps>) {
  const { t } = useTranslation();
  const conversations = useConversations();
  // Même clé de cache pour tous les appelants : une seule requête, quel que soit le nombre
  // d'écrans qui affichent le sélecteur.
  const { data: unread } = useUnreadByCapability();

  /**
   * Relue à chaque passage au premier plan, comme les notifications et les factures : le cache est
   * persisté et frais 5 min, donc un message arrivé pendant qu'on regardait ailleurs n'y apparaîtrait
   * qu'au tirer-pour-rafraîchir (#309). Les fils seulement : ce sont eux qui bougent, pas la liste
   * des interlocuteurs. Pas de sondage — on ne regarde pas cette liste changer.
   */
  const { refetch: refetchConversations } = conversations;
  useFocusEffect(
    useCallback(() => {
      void refetchConversations();
    }, [refetchConversations]),
  );

  const rows = useMemo(
    () => conversationRows(relations.data ?? [], conversations.data ?? [], as),
    [relations.data, conversations.data, as],
  );

  /**
   * Une notification n'apporte que le fil (`?conversation=`), la route d'un fil attend
   * l'interlocuteur : on le retrouve dans la liste, puis on l'ouvre (#599). Le paramètre est
   * CONSOMMÉ avant la navigation — sinon revenir du fil le rouvrirait aussitôt.
   */
  const { conversation: notified } = useLocalSearchParams<{ conversation?: string }>();
  const target = counterpartOfConversation(rows, notified);
  useEffect(() => {
    if (target == null) return;
    router.setParams({ conversation: undefined });
    router.push(`/messages/${target}`);
  }, [target]);

  const isPending = relations.isPending || conversations.isPending;
  const isError = relations.isError || conversations.isError;
  const refresh = () => {
    relations.refetch();
    conversations.refetch();
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
            refreshing={relations.isRefetching || conversations.isRefetching}
            onRefresh={refresh}
            // Le spinner est natif : il ignore les className, d'où la valeur (issue des tokens).
            tintColor={cmvColors.accent.DEFAULT}
          />
        }
      >
        {isPending ? <ActivityIndicator /> : null}
        {isError ? <CmvErrorState onRetry={refresh} /> : null}

        {!isPending && !isError && rows.length === 0 ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{emptyTitle}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">{emptyDescription}</CmvText>
          </View>
        ) : null}

        {rows.map((row) => (
          <ConversationRow key={row.counterpartId} row={row} />
        ))}
      </ScrollView>
    </CmvScreen>
  );
}

/** Le texte du dernier message, ou le TYPE de son média quand il n'en a pas ; sans message, le dire. */
function previewText(conversation: ConversationDto | null, t: TFunction): string {
  if (conversation == null) return t("messages.noMessageYet");
  if (conversation.lastMessagePreview != null) return conversation.lastMessagePreview;
  if (conversation.lastMessageType == null || conversation.lastMessageType === MessageType.TEXT) {
    return t("messages.noMessageYet");
  }
  return t(`messages.preview.${conversation.lastMessageType}`);
}

function ConversationRow({ row }: Readonly<{ row: Row }>) {
  const { t } = useTranslation();
  const conversation = row.conversation;
  const unread = conversation?.unreadCount ?? 0;

  /**
   * L'aperçu du dernier message : son texte, ou le TYPE du média quand il n'y a pas de texte.
   * `lastMessagePreview` est nullable par construction — un message peut n'être qu'une photo.
   */
  const preview = previewText(conversation, t);

  return (
    <Pressable
      onPress={() => router.push(`/messages/${row.counterpartId}`)}
      className="flex-row items-center gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3"
    >
      <View className="h-9 w-9 items-center justify-center rounded-md bg-cmv-surface-hi">
        <CmvText className="font-cmv-display text-cmv-text-mid text-xs">
          {initialsOf(row.counterpartName)}
        </CmvText>
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <CmvText className="flex-1 text-cmv-text-hi" numberOfLines={1}>
            {row.counterpartName}
          </CmvText>
          {/* `null` = aucun échange : pas de date inventée. */}
          <CmvText className="text-cmv-text-lo text-xs">
            {conversation?.lastMessageAt == null
              ? "—"
              : formatRelativeTime(conversation.lastMessageAt)}
          </CmvText>
        </View>
        <CmvText className="text-cmv-text-lo text-xs" numberOfLines={1}>
          {preview}
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
