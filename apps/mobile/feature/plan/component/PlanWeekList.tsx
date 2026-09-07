import type { AthleteCalendarWeek, ScheduledSessionSummaryDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SessionCard } from "@/feature/plan/component/SessionCard";
import { CmvText } from "@/shared/component";
import { formatDayNumber, formatWeekday } from "@/shared/util/date.util";

type PlanWeekListProps = {
  week: AthleteCalendarWeek<ScheduledSessionSummaryDto>;
  // Aujourd'hui, pour surligner le jour courant.
  today: string;
};

/**
 * Vue semaine de l'athlète : un jour par ligne, ses séances, et « Repos » quand il n'y en a pas.
 *
 * Le nom du cycle n'apparaît sur les cartes QUE si la semaine en compte plusieurs (#172) : avec un
 * seul cycle, il serait la même étiquette répétée à chaque ligne — du bruit sur un écran étroit.
 * Avec deux, il est ce qui rend deux séances du même mardi distinctes.
 */
export function PlanWeekList({ week, today }: Readonly<PlanWeekListProps>) {
  const { t } = useTranslation();
  const showPlanTitle = week.cycles.length > 1;

  return (
    <View className="gap-3">
      {week.days.map(({ date: day, entries }) => {
        const isToday = day === today;

        return (
          <View key={day} className="flex-row gap-3">
            <View className="w-12 items-center">
              <CmvText className={isToday ? "text-cmv-accent text-xs" : "text-cmv-text-lo text-xs"}>
                {formatWeekday(day)}
              </CmvText>
              <CmvText
                className={isToday ? "text-cmv-accent text-lg" : "text-cmv-text-mid text-lg"}
              >
                {formatDayNumber(day)}
              </CmvText>
            </View>

            <View className="flex-1 gap-2">
              {entries.length === 0 ? (
                <View className="justify-center rounded-lg border border-cmv-border border-dashed px-3 py-2">
                  <CmvText className="text-cmv-text-lo text-xs">{t("plan.rest")}</CmvText>
                </View>
              ) : (
                entries.map((entry) => (
                  <SessionCard
                    key={entry.session.id}
                    session={entry.session}
                    planLabel={showPlanTitle ? entry.planTitle : null}
                  />
                ))
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
