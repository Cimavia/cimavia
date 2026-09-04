import { type ConversationDto, initialsOf, MessageType } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useAthletes } from "@/feature/athlete";
import { useConversations } from "@/feature/message/hook/useConversation";
import { useUnreadByCapability } from "@/feature/notification/hook/useNotifications";
import { CmvCapabilitySwitch, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatRelativeTime } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values messages.preview: IMAGE, VIDEO, AUDIO

type Row = { athleteId: string; athleteName: string; conversation: ConversationDto | null };

/**
 * La liste des fils du coach (#34) : un par athlète TIERS, **qu'un fil existe ou non**. Sélectionner
 * un athlète jamais contacté crée le fil à la volée (get-or-create).
 *
 * Même fusion athlètes × fils que côté web : les fils les plus récemment actifs d'abord, puis les
 * athlètes sans échange. Un athlète absent de la liste serait injoignable — c'est pour ça qu'on
 * part des athlètes et non des conversations.
 */
export function CoachConversationsScreen() {
  const { t } = useTranslation();
  const athletes = useAthletes();
  const conversations = useConversations();
  // Même clé de cache pour tous les appelants : une seule requête, quel que soit le nombre
  // d'écrans qui affichent le sélecteur.
  const { data: unread } = useUnreadByCapability();

  const byAthlete = new Map(
    (conversations.data ?? []).map((conversation) => [conversation.counterpartId, conversation]),
  );
  const rows: Row[] = (athletes.data ?? [])
    // L'entrée SYNTHÉTIQUE de l'auto-coaching est écartée ici, et ici seulement (#198) : elle reste
    // sur `GET /athletes`, dont le tableau de bord et le constructeur de cycle dépendent (#14). La
    // messagerie est la seule surface où elle n'a pas de sens — le fil `(soi, soi)` ne peut pas
    // exister, et la ligne menait à un écran d'erreur.
    .filter((relation) => !relation.isSelf)
    .map((relation) => ({
      athleteId: relation.athleteId,
      athleteName: relation.athleteName,
      conversation: byAthlete.get(relation.athleteId) ?? null,
    }))
    .sort((a, b) =>
      (b.conversation?.lastMessageAt ?? "").localeCompare(a.conversation?.lastMessageAt ?? ""),
    );

  const isPending = athletes.isPending || conversations.isPending;
  const isError = athletes.isError || conversations.isError;
  const refresh = () => {
    athletes.refetch();
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
            refreshing={athletes.isRefetching || conversations.isRefetching}
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
            <CmvText className="text-cmv-text-hi">{t("messages.noAthletes.title")}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">
              {t("messages.noAthletes.description")}
            </CmvText>
          </View>
        ) : null}

        {rows.map((row) => (
          <ConversationRow key={row.athleteId} row={row} />
        ))}
      </ScrollView>
    </CmvScreen>
  );
}

function ConversationRow({ row }: Readonly<{ row: Row }>) {
  const { t } = useTranslation();
  const conversation = row.conversation;
  const unread = conversation?.unreadCount ?? 0;

  /**
   * L'aperçu du dernier message : son texte, ou le TYPE du média quand il n'y a pas de texte.
   * `lastMessagePreview` est nullable par construction — un message peut n'être qu'une photo.
   */
  const preview =
    conversation == null
      ? t("messages.noMessageYet")
      : (conversation.lastMessagePreview ??
        (conversation.lastMessageType == null || conversation.lastMessageType === MessageType.TEXT
          ? t("messages.noMessageYet")
          : t(`messages.preview.${conversation.lastMessageType}`)));

  return (
    <Pressable
      onPress={() => router.push(`/messages/${row.athleteId}`)}
      className="flex-row items-center gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3"
    >
      <View className="h-9 w-9 items-center justify-center rounded-md bg-cmv-surface-hi">
        <CmvText className="font-cmv-display text-cmv-text-mid text-xs">
          {initialsOf(row.athleteName)}
        </CmvText>
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <CmvText className="flex-1 text-cmv-text-hi" numberOfLines={1}>
            {row.athleteName}
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
