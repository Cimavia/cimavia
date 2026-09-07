import type { AthleteCalendarWeek, ScheduledSessionSummaryDto } from "@cmv/shared";
import type { CSSProperties } from "react";
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
 *
 * ## La hauteur des cases, et ce qui a changé
 *
 * #206 avait donné à chaque jour la hauteur de sa colonne, et à ses cartes une part égale de cette
 * hauteur (`flex-1` + `auto-rows-fr`). Conséquence non voulue, visible dès que les jours ne portent
 * pas le même nombre de séances : **la carte d'un jour qui n'en a qu'une devenait trois fois plus
 * haute** que chacune des trois d'un jour chargé. La taille d'une carte se mettait à dépendre de ce
 * que faisaient les jours voisins.
 *
 * La règle est désormais : **toutes les cartes de la semaine ont la même hauteur, celle de la plus
 * remplie**. Elle se tient par une `subgrid` — les sept jours partagent les RANGÉES de la grille de
 * la semaine, si bien qu'une rangée fait la hauteur de la carte la plus haute qu'elle contient, et
 * que les rangées `1fr` s'égalisent entre elles. Aucune carte n'est étirée, aucun jour ne dicte la
 * taille d'un autre.
 *
 * En dessous de `xl` la rangée de sept jours n'existe pas (les jours s'empilent en une ou deux
 * colonnes) : il n'y a alors plus de rangée commune à égaliser, et les cartes reprennent la taille
 * de leur contenu, avec le plancher `min-h-24` pour tout le monde. C'est la même frontière que
 * celle posée en #206 — ce qui vaut à toutes les largeurs est le PLANCHER, pas l'égalisation.
 */
export function AthleteWeekGrid({ week, today }: Readonly<AthleteWeekGridProps>) {
  const { t } = useTranslation();
  const showPlanTitle = week.cycles.length > 1;

  /**
   * Le nombre de rangées de cartes : celui du jour le plus rempli, jamais moins d'une — une semaine
   * entièrement au repos a quand même sept boîtes « Repos » à poser.
   */
  const rowCount = Math.max(1, ...week.days.map((day) => day.entries.length));

  /**
   * Les gabarits sont dynamiques (ils dépendent de `rowCount`), donc portés par des variables CSS :
   * Tailwind ne peut pas générer une classe dont le nom se calcule à l'exécution. Les classes, elles,
   * restent littérales — c'est ce qui les rend visibles du JIT.
   */
  const weekStyle = { "--cmv-week-rows": rowCount } as CSSProperties;
  const dayStyle = { "--cmv-week-span": rowCount + 1 } as CSSProperties;

  return (
    <div
      style={weekStyle}
      className={cn(
        "grid gap-cmv-sm md:grid-cols-2 xl:grid-cols-7",
        // Une rangée `auto` pour l'intitulé du jour, puis N rangées égales pour les cartes. `1fr`
        // dans une grille de hauteur libre égalise les rangées sur la plus haute — c'est là que se
        // décide « toutes les cartes à la taille de la plus remplie ».
        "xl:[grid-template-rows:auto_repeat(var(--cmv-week-rows),minmax(6rem,1fr))]",
      )}
    >
      {week.days.map(({ date: day, entries }) => {
        const isToday = day === today;

        return (
          <div
            key={day}
            style={dayStyle}
            className={cn(
              "flex flex-col gap-cmv-sm",
              // Le jour cesse d'être une colonne autonome pour épouser les rangées de la semaine.
              "xl:grid xl:grid-rows-subgrid xl:[grid-row:span_var(--cmv-week-span)]",
            )}
          >
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

            {/* En `xl`, ce conteneur DISPARAÎT (`contents`) : les cartes deviennent alors les
                éléments de la subgrid, seule façon qu'elles ont d'atterrir dans les rangées
                partagées. En dessous, il redevient une grille ordinaire et porte le plancher — que
                la subgrid assure de son côté par le `minmax(6rem, …)` de ses rangées. */}
            <div className="grid min-h-24 auto-rows-min gap-cmv-sm xl:contents">
              {entries.length === 0 ? (
                // Un jour sans séance est une information, pas un trou : le cycle prévoit du repos.
                <div
                  className={cn(
                    "flex items-center justify-center rounded-cmv-md border border-cmv-border border-dashed p-cmv-sm",
                    // La boîte couvre TOUTES les rangées de cartes : c'est le seul élément de la
                    // journée, et la laisser sur une seule rangée creuserait un trou sous elle.
                    // `--cmv-week-rows` s'hérite de la semaine et vaut exactement ce compte — pas
                    // de `calc()` dans un `span`, dont le support est moins sûr qu'une variable.
                    "xl:[grid-row:span_var(--cmv-week-rows)]",
                  )}
                >
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
