import { type BlockSegment, SegmentKind } from "@cmv/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type RunnerContext = {
  exerciseId: string;
  blockId: string;
  /** Le titre de l'exercice, affiché en grand pendant le déroulé. */
  title: string;
};

/**
 * Le déroulé d'un exercice, segment après segment.
 *
 * Ce qu'il remplace : une pastille à taper à chaque effort et à chaque repos. L'athlète lance son
 * exercice une fois, et l'enchaînement se fait seul jusqu'au dernier segment.
 *
 * Le temps se lit sur une échéance ABSOLUE, jamais en décrémentant. Ici c'est vital : l'app est
 * gelée en arrière-plan, et l'athlète qui rouvre au bout de trois segments doit retrouver le bon,
 * pas celui qu'il avait quitté. D'où le rattrapage en boucle plutôt qu'un simple `index + 1`.
 */
export function useSegmentRunner(onUnitDone: (blockId: string, unitIndex: number) => void) {
  const [segments, setSegments] = useState<readonly BlockSegment[]>([]);
  const [context, setContext] = useState<RunnerContext | null>(null);
  const [index, setIndex] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [paused, setPaused] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const doneRef = useRef(onUnitDone);
  doneRef.current = onUnitDone;

  const stop = useCallback(() => {
    setSegments([]);
    setContext(null);
    setIndex(0);
    setEndsAt(null);
    setPaused(null);
    setRemaining(0);
  }, []);

  /** Le segment fini fait avancer SON unité — l'athlète a terminé, le décompte doit le dire. */
  const markUnit = useCallback((blockId: string, segment: BlockSegment | undefined) => {
    if (segment?.unitIndex == null) return;
    if (segment.kind === SegmentKind.COUNTDOWN) return;
    doneRef.current(blockId, segment.unitIndex);
  }, []);

  useEffect(() => {
    if (endsAt == null || paused != null || context == null) return;

    const tick = () => {
      let cursor = index;
      let deadline = endsAt;
      const now = Date.now();

      // Rattrapage : plusieurs segments ont pu s'écouler pendant que l'app dormait.
      while (now >= deadline) {
        markUnit(context.blockId, segments[cursor]);
        const next = segments[cursor + 1];
        if (next == null) {
          stop();
          return;
        }
        cursor += 1;
        deadline += next.seconds * 1000;
      }

      if (cursor !== index) {
        setIndex(cursor);
        setEndsAt(deadline);
      }
      setRemaining(Math.max(0, Math.ceil((deadline - now) / 1000)));
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, paused, index, segments, context, markUnit, stop]);

  const start = useCallback((next: readonly BlockSegment[], runnerContext: RunnerContext) => {
    const first = next[0];
    if (first == null) return;
    setSegments(next);
    setContext(runnerContext);
    setIndex(0);
    setPaused(null);
    setRemaining(first.seconds);
    setEndsAt(Date.now() + first.seconds * 1000);
  }, []);

  const pause = useCallback(() => {
    if (endsAt == null) return;
    setPaused(Math.max(0, endsAt - Date.now()));
  }, [endsAt]);

  const resume = useCallback(() => {
    if (paused == null) return;
    setEndsAt(Date.now() + paused);
    setPaused(null);
  }, [paused]);

  /** « Passer le segment » : on saute sans marquer l'unité — un segment écourté n'est pas fait. */
  const skip = useCallback(() => {
    const next = segments[index + 1];
    if (next == null) {
      stop();
      return;
    }
    setIndex(index + 1);
    setPaused(null);
    setRemaining(next.seconds);
    setEndsAt(Date.now() + next.seconds * 1000);
  }, [segments, index, stop]);

  const add = useCallback((seconds: number) => {
    setEndsAt((current) => (current == null ? null : current + seconds * 1000));
    setPaused((current) => (current == null ? null : current + seconds * 1000));
  }, []);

  const current = segments[index] ?? null;

  return {
    context,
    segments,
    index,
    current,
    remaining,
    /** Le total du segment courant, pour la barre de progression. */
    total: current?.seconds ?? 0,
    /** Ce qu'il reste sur TOUT le déroulé — « Reste 7'18 » de la maquette. */
    totalRemaining: remaining + sumSeconds(segments.slice(index + 1)),
    active: context != null,
    isPaused: paused != null,
    /** L'échéance suivie par la notification programmée. `null` en pause. */
    deadline: paused == null ? endsAt : null,
    start,
    pause,
    resume,
    skip,
    add,
    stop,
  };
}

function sumSeconds(segments: readonly BlockSegment[]): number {
  return segments.reduce((total, segment) => total + segment.seconds, 0);
}
