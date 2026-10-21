import type { PlanWeekDto, ScheduledSessionSummaryDto } from "@cmv/shared";
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

  return weeks.map((week) => (
    <PlanWeekCard
      key={week.id}
      planId={planId}
      planTitle={planTitle}
      isPublished={isPublished}
      readOnly={readOnly}
      week={week}
      drag={drag}
      onAddSession={onAddSession}
      onEditSession={onEditSession}
    />
  ));
}
