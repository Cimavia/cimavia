import { todayIsoDate } from "@cmv/shared";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useMyCoach } from "@/feature/coach";
import { PlanWeekList } from "@/feature/plan/component/PlanWeekList";
import { currentWeek, useMyPlan } from "@/feature/plan/hook/useMyPlan";
import { CmvButton, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatDateRange } from "@/shared/util/date.util";

// Vue semaine de l'athlète (p3-4) : la semaine EN COURS de son cycle diffusé.
export function PlanningScreen() {
  const { t } = useTranslation();
  const { data: plan, isPending, isError, refetch } = useMyPlan();
  const { data: coach } = useMyCoach();

  const today = todayIsoDate();
  const week = currentWeek(plan);

  const doneCount = week?.sessions.filter((session) => session.status === "DONE").length ?? 0;

  return (
    <CmvScreen>
      <OfflineBanner />

      <ScrollView contentContainerClassName="gap-6 p-4">
        {isPending ? <ActivityIndicator /> : null}

        {/* Hors-ligne, le cache sert encore le plan : l'erreur n'a de sens que sans données. */}
        {isError && plan == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {/* « Sans coach » et « coach sans cycle diffusé » sont deux états DIFFÉRENTS : dire à un
            athlète non rattaché que son coach n'a rien diffusé le laisserait attendre pour rien. */}
        {!isPending && !isError && plan == null && coach == null ? (
          <View className="gap-3 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{t("coach.missing.title")}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">
              {t("coach.missing.description")}
            </CmvText>
            <CmvButton label={t("coach.missing.action")} onPress={() => router.push("/join")} />
          </View>
        ) : null}

        {!isPending && !isError && plan == null && coach != null ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{t("plan.empty.title")}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">{t("plan.empty.description")}</CmvText>
          </View>
        ) : null}

        {/* Un cycle existe mais aucune semaine ne contient aujourd'hui : il est fini ou à venir.
            On le dit, plutôt que d'afficher la semaine 1 comme si c'était la semaine courante. */}
        {plan != null && week == null ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{plan.title}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">{t("plan.outOfCycle")}</CmvText>
          </View>
        ) : null}

        {plan != null && week != null ? (
          <>
            <View className="gap-1">
              <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
                {t("plan.thisWeek")}
              </CmvText>
              <CmvText className="text-cmv-text-mid">
                {t("plan.week.number", { number: week.weekNumber })} ·{" "}
                {t(`plan.weekType.${week.type}`)}
              </CmvText>
              <CmvText className="text-cmv-text-lo text-sm">
                {formatDateRange(week.startDate, week.endDate)} ·{" "}
                {t("plan.doneCount", { done: doneCount, total: week.sessions.length })}
              </CmvText>
              {week.note == null ? null : (
                <CmvText className="text-cmv-text-mid text-sm">{week.note}</CmvText>
              )}
            </View>

            <PlanWeekList week={week} today={today} />
          </>
        ) : null}
      </ScrollView>
    </CmvScreen>
  );
}
