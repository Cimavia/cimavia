import { type PlanWeekDto, planWeekDays } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SessionCard } from "@/feature/plan/component/SessionCard";
import { CmvText } from "@/shared/component";
import { formatDayNumber, formatWeekday } from "@/shared/util/date.util";

type PlanWeekListProps = {
  week: PlanWeekDto;
  // Aujourd'hui, pour surligner le jour courant.
  today: string;
};

// Vue semaine de l'athlète : un jour par ligne, ses séances, et « Repos » quand il n'y en a pas.
export function PlanWeekList({ week, today }: Readonly<PlanWeekListProps>) {
  const { t } = useTranslation();

  const sessionsByDay = new Map<string, typeof week.sessions>();
  for (const session of week.sessions) {
    const existing = sessionsByDay.get(session.scheduledDate) ?? [];
    existing.push(session);
    sessionsByDay.set(session.scheduledDate, existing);
  }

  return (
    <View className="gap-3">
      {(planWeekDays(week.startDate) ?? []).map((day) => {
        const sessions = sessionsByDay.get(day) ?? [];
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
              {sessions.length === 0 ? (
                <View className="justify-center rounded-lg border border-cmv-border border-dashed px-3 py-2">
                  <CmvText className="text-cmv-text-lo text-xs">{t("plan.rest")}</CmvText>
                </View>
              ) : (
                sessions.map((session) => <SessionCard key={session.id} session={session} />)
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
