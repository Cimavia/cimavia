import type { PlanWeekDto } from "@cmv/shared";
import { planWeekDays } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { AthleteSessionCard } from "@/feature/plan/component/AthleteSessionCard";
import { cn } from "@/shared/util/cn.util";
import { formatDayNumber, formatWeekday } from "@/shared/util/date.util";

type AthleteWeekGridProps = {
  week: PlanWeekDto;
  today: string;
};

/**
 * La semaine en sept colonnes — la lecture que le desktop permet et que le mobile ne permet pas
 * (celui-ci empile les jours). C'est le seul endroit où les deux plateformes divergent vraiment
 * sur cet écran, et c'est la raison d'être de la maquette web dédiée.
 *
 * Les sept jours viennent de `planWeekDays`, jamais des séances : une semaine sans aucune séance
 * doit quand même afficher ses sept colonnes, sinon « rien de prévu » se lirait « rien à afficher ».
 */
export function AthleteWeekGrid({ week, today }: Readonly<AthleteWeekGridProps>) {
  const { t } = useTranslation();
  const days = planWeekDays(week.startDate);

  // `null` = la semaine n'est pas situable (date illisible). On ne dessine pas une grille fausse.
  if (days == null) return null;

  return (
    <div className="grid gap-cmv-sm md:grid-cols-2 xl:grid-cols-7">
      {days.map((day) => {
        // Plusieurs séances possibles le même jour : `position` est le rang DANS la journée.
        const sessions = week.sessions
          .filter((session) => session.scheduledDate === day)
          .sort((a, b) => a.position - b.position);
        const isToday = day === today;

        return (
          <div key={day} className="flex flex-col gap-cmv-sm">
            <div className="flex items-baseline gap-cmv-xs">
              <span
                className={cn(
                  "font-cmv-mono text-cmv-caption uppercase tracking-wide",
                  isToday ? "text-cmv-text-hi" : "text-cmv-text-lo",
                )}
              >
                {formatWeekday(day)} {formatDayNumber(day)}
              </span>
              {isToday ? (
                <span className="text-cmv-caption text-cmv-accent">{t("plan.athlete.today")}</span>
              ) : null}
            </div>

            {sessions.length === 0 ? (
              // Un jour sans séance est une information, pas un trou : le cycle prévoit du repos.
              <div className="flex min-h-24 items-center justify-center rounded-cmv-md border border-cmv-border border-dashed p-cmv-sm">
                <span className="text-cmv-caption text-cmv-text-lo">{t("plan.athlete.rest")}</span>
              </div>
            ) : (
              sessions.map((session) => <AthleteSessionCard key={session.id} session={session} />)
            )}
          </div>
        );
      })}
    </div>
  );
}
