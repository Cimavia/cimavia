import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvDragHandle } from "@/shared/component";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { cn } from "@/shared/util/cn.util";
import { formatDayLabel } from "@/shared/util/date.util";

type PlanDayCellProps = {
  date: string;
  sessions: readonly ScheduledSessionSummaryDto[];
  isBusy: boolean;
  onAddSession: (date: string) => void;
  onEditSession: (session: ScheduledSessionSummaryDto) => void;
  /** L'ordre voulu, EN ENTIER : l'API attend une permutation, pas un extrait. */
  onReorder: (date: string, sessionIds: string[]) => void;
};

/**
 * Un jour de la grille de semaine, et les séances qu'il porte (#148).
 *
 * Sa propre composante parce que le glisser-déposer est un état PAR JOURNÉE : deux séances ne se
 * réordonnent qu'entre elles, et un hook ne s'appelle pas dans une boucle.
 *
 * Pas de flèches ↑/↓ ici, contrairement au constructeur de séance : une case fait un septième de
 * la largeur, et deux boutons de plus par séance la rendraient illisible. La poignée EST le chemin
 * clavier — c'est un bouton focusable qui répond aux flèches.
 */
export function PlanDayCell({
  date,
  sessions,
  isBusy,
  onAddSession,
  onEditSession,
  onReorder,
}: Readonly<PlanDayCellProps>) {
  const { t } = useTranslation();

  function move(from: number, to: number) {
    if (to < 0 || to >= sessions.length) return;
    const next = [...sessions];
    const [moved] = next.splice(from, 1);
    if (moved == null) return;
    next.splice(to, 0, moved);
    onReorder(
      date,
      next.map((session) => session.id),
    );
  }

  const drag = useReorderDrag(move);
  // Une journée d'une seule séance n'a rien à réordonner : la poignée y serait du décor.
  const isOrderable = sessions.length > 1;

  return (
    <div className="flex min-h-24 flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-lo">{formatDayLabel(date)}</span>

      {sessions.map((session, index) => (
        <div
          key={session.id}
          {...(isOrderable ? drag.rowProps(index) : {})}
          className={cn(
            "flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-border transition-colors",
            isOrderable && drag.isDragging(index) && "opacity-40",
            isOrderable && drag.isOver(index)
              ? "bg-cmv-accent-soft"
              : "bg-cmv-surface hover:border-cmv-border-hi hover:bg-cmv-surface-hi",
          )}
        >
          {isOrderable ? (
            <CmvDragHandle
              label={`${t("plan.week.moveSession")} ${index + 1}`}
              {...drag.handleProps(index)}
              onMove={(direction) => move(index, index + direction)}
            />
          ) : null}
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
