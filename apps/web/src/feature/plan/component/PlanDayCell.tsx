import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import type { useWeekDrag } from "@/feature/plan/hook/useWeekDrag";
import { CmvButton, CmvDragHandle } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatDayLabel } from "@/shared/util/date.util";

type PlanDayCellProps = {
  date: string;
  sessions: readonly ScheduledSessionSummaryDto[];
  isBusy: boolean;
  /** Le glisser de la SEMAINE : une case ne peut pas le tenir, une séance en sort. */
  drag: ReturnType<typeof useWeekDrag>;
  onAddSession: (date: string) => void;
  onEditSession: (session: ScheduledSessionSummaryDto) => void;
  /** Déplace d'un cran DANS la journée — le chemin clavier de la poignée. */
  onMoveWithinDay: (date: string, index: number, direction: -1 | 1) => void;
};

/**
 * Un jour de la grille de semaine, et les séances qu'il porte (#148, élargi en #93).
 *
 * Pas de flèches ↑/↓ ici, contrairement au constructeur de séance : une case fait un septième de
 * la largeur, et deux boutons de plus par séance la rendraient illisible. La poignée EST le chemin
 * clavier — c'est un bouton focusable qui répond aux flèches.
 *
 * Ce que le clavier ne fait PAS : sortir de la journée. Déplacer une séance vers un autre jour se
 * fait au glisser, ou par le sélecteur « Jour » du panneau de séance — qui est, lui, un chemin
 * clavier complet. C'est ce qui rend ce geste-ci accessoire plutôt qu'exclusif.
 */
export function PlanDayCell({
  date,
  sessions,
  isBusy,
  drag,
  onAddSession,
  onEditSession,
  onMoveWithinDay,
}: Readonly<PlanDayCellProps>) {
  const { t } = useTranslation();

  return (
    <div
      {...drag.dayProps(date, sessions.length)}
      className={cn(
        "flex min-h-24 flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border p-cmv-sm",
        drag.isDayOver(date, sessions.length) ? "bg-cmv-accent-soft" : "bg-cmv-bg-1",
      )}
    >
      <span className="text-cmv-caption text-cmv-text-lo">{formatDayLabel(date)}</span>

      {sessions.map((session, index) => (
        <div
          key={session.id}
          {...drag.cardProps(date, index)}
          className={cn(
            "flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-border transition-colors",
            drag.isDragging(date, index) && "opacity-40",
            drag.isOver(date, index)
              ? "bg-cmv-accent-soft"
              : "bg-cmv-surface hover:border-cmv-border-hi hover:bg-cmv-surface-hi",
          )}
        >
          {/* La poignée est offerte même sur une séance SEULE dans sa journée : depuis #93 elle
              peut partir vers un autre jour, et l'affordance doit dire ce que le geste permet. */}
          <CmvDragHandle
            label={`${t("plan.week.moveSession")} ${index + 1}`}
            {...drag.handleProps(date, index)}
            onMove={(direction) => onMoveWithinDay(date, index, direction)}
          />
          {/* La carte n'est plus un `button` à elle seule : la poignée en est un, et un bouton
              dans un bouton n'est pas du HTML valide. Le titre porte donc l'ouverture. */}
          <button
            type="button"
            onClick={() => onEditSession(session)}
            className="flex min-w-0 flex-1 flex-col gap-cmv-xs px-cmv-sm py-cmv-xs text-left"
          >
            <span className="truncate text-cmv-caption text-cmv-text-hi">{session.title}</span>
            <span className="text-cmv-caption text-cmv-text-lo">
              {t("plan.session.exerciseCount", { count: session.exerciseCount })}
            </span>
          </button>
        </div>
      ))}

      <CmvButton variant="ghost" onClick={() => onAddSession(date)} disabled={isBusy}>
        {t("plan.week.addSession")}
      </CmvButton>
    </div>
  );
}
