import { type BlockSegment, type CustomMetric, type ExerciseBlock, SegmentKind } from "@cmv/shared";
import { useCallback, useRef } from "react";
import { useTimeline } from "@/feature/plan/hook/useTimeline";

export type RunnerContext = {
  exerciseId: string;
  /** Le bloc déroulé : le calque y lit le dosage de la ligne en cours et la forme du bandeau. */
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  /** Le titre de l'exercice, affiché en grand pendant le déroulé. */
  title: string;
};

/**
 * Le déroulé d'un exercice, segment après segment (ancien modèle, jusqu'à #723).
 *
 * Ce qu'il remplace : une pastille à taper à chaque effort et à chaque repos. L'athlète lance son
 * exercice une fois, et l'enchaînement se fait seul jusqu'au dernier segment. Le moteur — échéance
 * absolue, rattrapage, pause — est `useTimeline`, partagé avec le chrono d'un bloc (#722).
 */
export function useSegmentRunner(onUnitDone: (blockId: string, unitIndex: number) => void) {
  const doneRef = useRef(onUnitDone);
  doneRef.current = onUnitDone;

  /**
   * Le segment fini fait avancer SON unité — mais seulement quand sa DURÉE est le travail.
   *
   * Tenir 30 s de gainage, c'est fait quand les 30 s sont passées : la cocher d'office est juste.
   * Un top d'EMOM, non — la minute tombe que l'athlète ait fait ses trois tractions ou pas, et
   * cocher au passage inventerait un décompte que personne n'a validé. Il a son « Top fait ».
   */
  const markUnit = useCallback((context: RunnerContext, segment: BlockSegment) => {
    if (segment.unitIndex == null) return;
    if (segment.kind === SegmentKind.COUNTDOWN || segment.kind === SegmentKind.INTERVAL) return;
    doneRef.current(context.block.id, segment.unitIndex);
  }, []);

  return useTimeline<BlockSegment, RunnerContext>(isManual, markUnit);
}

/** Un segment MANUEL n'a pas d'échéance : le déroulé s'y arrête et attend le geste de l'athlète. */
function isManual(segment: BlockSegment): boolean {
  return segment.kind === SegmentKind.MANUAL;
}
