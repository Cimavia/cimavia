import type { PlanWeekDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import { firstMovableWeek, PLAN_MAX_WEEKS } from "@cmv/shared";
import { PlanWeekCard } from "@/feature/plan/component/PlanWeekCard";
import { useCycleDrag } from "@/feature/plan/hook/useCycleDrag";

type PlanWeekListProps = {
  planId: string;
  planTitle: string;
  isPublished: boolean;
  readOnly: boolean;
  weeks: readonly PlanWeekDto[];
  onAddSession: (date: string) => void;
  onEditSession: (session: ScheduledSessionSummaryDto) => void;
};

/**
 * Les semaines du cycle, et le glisser qui les relie (#689).
 *
 * Le glisser vit ICI, au-dessus des cartes, pour qu'une séance passe d'une semaine à l'autre — et
 * pas plus haut : son état change à chaque case survolée, et tenu par l'écran, il redessinerait
 * aussi l'en-tête et la facturation du cycle pendant tout le geste.
 */
export function PlanWeekList({
  planId,
  planTitle,
  isPublished,
  readOnly,
  weeks,
  onAddSession,
  onEditSession,
}: Readonly<PlanWeekListProps>) {
  const drag = useCycleDrag(planId, weeks);
  // Lus sur le cycle ENTIER, pas sur la semaine : une séance faite plus loin retient aussi celle-ci.
  const movableFrom = firstMovableWeek(weeks);
  const isFull = weeks.length >= PLAN_MAX_WEEKS;

  return weeks.map((week) => (
    <PlanWeekCard
      key={week.id}
      planId={planId}
      planTitle={planTitle}
      isPublished={isPublished}
      readOnly={readOnly}
      week={week}
      insertClosedReason={insertClosedReason(week.weekNumber, movableFrom, isFull)}
      drag={drag}
      onAddSession={onAddSession}
      onEditSession={onEditSession}
    />
  ));
}

/**
 * Pourquoi « Insérer une semaine avant » est fermé sur cette semaine, ou `null` s'il est ouvert
 * (#231). La séance faite d'abord : c'est elle qui dit au Coach où le geste redevient possible,
 * là où le plafond ne s'y prête nulle part.
 */
function insertClosedReason(
  weekNumber: number,
  movableFrom: number,
  isFull: boolean,
): { key: string; max?: number } | null {
  if (weekNumber < movableFrom) return { key: "plan.week.insertDisabledSettled" };
  if (isFull) return { key: "plan.week.insertDisabledFull", max: PLAN_MAX_WEEKS };
  return null;
}
