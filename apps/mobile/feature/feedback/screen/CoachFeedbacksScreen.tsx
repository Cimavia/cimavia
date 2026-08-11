import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useCoachFeedbacks } from "@/feature/feedback/hook/useCoachFeedbacks";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatRelativeTime } from "@/shared/util/date.util";

/**
 * Débriefs reçus par le coach (#33), en deux groupes : à relire, puis déjà lus.
 *
 * « Non lu » ne veut pas dire « jamais ouvert » : `coachReadAt` repasse à `null` quand l'athlète
 * COMPLÈTE son débrief. Un débrief déjà lu peut donc remonter dans la pile — c'est voulu, sans quoi
 * un ajout tardif resterait invisible.
 *
 * Deux groupes plutôt qu'un filtre : ce qui reste à faire doit être visible sans geste, et les
 * anciens débriefs restent consultables sans changer d'écran.
 */
export function CoachFeedbacksScreen() {
  const { t } = useTranslation();
  const { data: feedbacks, isPending, isError, isRefetching, refetch } = useCoachFeedbacks();

  const unread = (feedbacks ?? []).filter((feedback) => feedback.coachReadAt == null);
  const read = (feedbacks ?? []).filter((feedback) => feedback.coachReadAt != null);
  const isEmpty = !isPending && !isError && (feedbacks ?? []).length === 0;

  return (
    <CmvScreen>
      <OfflineBanner />

      <View className="px-4 pt-4">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {t("feedback.coach.title")}
        </CmvText>
        <CmvText className="text-cmv-text-mid text-sm">
          {t("feedback.coach.unreadCount", { count: unread.length })}
        </CmvText>
      </View>

      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-4 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            // Le spinner est natif : il ignore les className, d'où la valeur (issue des tokens).
            tintColor={cmvColors.accent.DEFAULT}
          />
        }
      >
        {isPending ? <ActivityIndicator /> : null}
        {isError && feedbacks == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {isEmpty ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{t("feedback.coach.empty.title")}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">
              {t("feedback.coach.empty.description")}
            </CmvText>
          </View>
        ) : null}

        {unread.map((feedback) => (
          <FeedbackRow key={feedback.id} feedback={feedback} />
        ))}

        {read.length === 0 ? null : (
          <>
            <CmvText className="pt-2 text-cmv-text-mid text-xs uppercase">
              {t("feedback.coach.alreadyRead")}
            </CmvText>
            {read.map((feedback) => (
              <FeedbackRow key={feedback.id} feedback={feedback} />
            ))}
          </>
        )}
      </ScrollView>
    </CmvScreen>
  );
}

// Une ligne mène au détail, qui porte le texte complet et les médias — le résumé n'en a que le
// compte. Un débrief déjà lu est atténué, pas masqué : il reste consultable.
function FeedbackRow({ feedback }: Readonly<{ feedback: CoachFeedbackSummaryDto }>) {
  const { t } = useTranslation();
  const isRead = feedback.coachReadAt != null;

  return (
    <Pressable
      onPress={() => router.push(`/feedbacks/${feedback.scheduledSessionId}`)}
      className={`gap-1 rounded-lg border border-cmv-border p-4 ${isRead ? "bg-cmv-bg-1" : "bg-cmv-surface"}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <CmvText className={isRead ? "text-cmv-text-mid" : "text-cmv-text-hi"} numberOfLines={1}>
          {feedback.athleteName}
        </CmvText>
        <CmvText className="text-cmv-text-lo text-xs">
          {formatRelativeTime(feedback.updatedAt)}
        </CmvText>
      </View>

      <CmvText className="text-cmv-text-mid text-xs" numberOfLines={1}>
        {feedback.sessionTitle}
      </CmvText>

      {/* Le texte est NULLABLE : un débrief peut n'être que des médias. On le dit plutôt que
          d'afficher une ligne vide. */}
      <CmvText className="text-cmv-text-lo text-sm" numberOfLines={2}>
        {feedback.content ?? t("feedback.coach.mediaOnly")}
      </CmvText>

      {feedback.mediaCount === 0 ? null : (
        <CmvText className="text-cmv-accent text-xs">
          {t("feedback.coach.mediaCount", { count: feedback.mediaCount })}
        </CmvText>
      )}
    </Pressable>
  );
}
