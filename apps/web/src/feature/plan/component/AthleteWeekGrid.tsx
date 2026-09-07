import type { AthleteCalendarWeek, ScheduledSessionSummaryDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { AthleteSessionCard } from "@/feature/plan/component/AthleteSessionCard";
import { cn } from "@/shared/util/cn.util";
import { formatDayNumber, formatWeekday } from "@/shared/util/date.util";

type AthleteWeekGridProps = {
  week: AthleteCalendarWeek<ScheduledSessionSummaryDto>;
  today: string;
};

/**
 * La semaine en sept colonnes — la lecture que le desktop permet et que le mobile ne permet pas
 * (celui-ci empile les jours). C'est le seul endroit où les deux plateformes divergent vraiment
 * sur cet écran, et c'est la raison d'être de la maquette web dédiée.
 *
 * Les sept jours viennent de `athleteCalendarWeek`, jamais des séances : une semaine sans aucune
 * séance doit quand même afficher ses sept colonnes, sinon « rien de prévu » se lirait « rien à
 * afficher ».
 *
 * Le nom du cycle n'apparaît sur les cartes QUE si la semaine en compte plusieurs (#172) : avec un
 * seul cycle, il serait la même étiquette répétée sept fois — du bruit qui déplace la lecture du
 * contenu vers son origine. Avec deux, il est ce qui rend deux séances du même mardi distinctes.
 */
export function AthleteWeekGrid({ week, today }: Readonly<AthleteWeekGridProps>) {
  const { t } = useTranslation();
  const showPlanTitle = week.cycles.length > 1;

  return (
    <div className="grid gap-cmv-sm md:grid-cols-2 xl:grid-cols-7">
      {week.days.map(({ date: day, entries }) => {
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

            {/* Le contenu du jour dans SA propre grille. La colonne tient déjà la hauteur de la
                rangée (élément de grille, `stretch`), mais c'est un flex colonne : `stretch` y joue
                sur la largeur, pas sur la hauteur, et la boîte reste à la taille de son texte.
                `flex-1` lui donne la hauteur restante, `auto-rows-fr` la passe à ses enfants — qui
                s'étirent d'eux-mêmes, sans que `AthleteSessionCard` ait à le savoir (elle sert
                aussi la liste verticale de `/sessions`, où un étirement n'aurait aucun sens).

                `min-h-24` est porté ICI, et non plus par la seule boîte « Repos » : cet écart de
                plancher est ce qui faisait paraître un jour de repos PLUS HAUT qu'une séance
                courte. Il vaut à toutes les largeurs — deux cases voisines se comparent à l'œil en
                deux colonnes comme en sept. */}
            <div className="grid min-h-24 flex-1 auto-rows-fr gap-cmv-sm">
              {entries.length === 0 ? (
                // Un jour sans séance est une information, pas un trou : le cycle prévoit du repos.
                <div className="flex items-center justify-center rounded-cmv-md border border-cmv-border border-dashed p-cmv-sm">
                  <span className="text-cmv-caption text-cmv-text-lo">
                    {t("plan.athlete.rest")}
                  </span>
                </div>
              ) : (
                entries.map((entry) => (
                  <AthleteSessionCard
                    key={entry.session.id}
                    session={entry.session}
                    planLabel={showPlanTitle ? entry.planTitle : null}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
