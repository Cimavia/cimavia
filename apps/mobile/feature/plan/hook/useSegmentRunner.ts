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

  /**
   * Avance au segment `cursor`. Un segment MANUEL n'a pas d'échéance : le déroulé s'y arrête et
   * attend le geste de l'athlète, `endsAt` reste `null`.
   */
  const enter = useCallback((next: readonly BlockSegment[], cursor: number) => {
    const segment = next[cursor];
    if (segment == null) return;
    setIndex(cursor);
    setPaused(null);
    setRemaining(segment.seconds);
    setEndsAt(segment.kind === SegmentKind.MANUAL ? null : Date.now() + segment.seconds * 1000);
  }, []);

  useEffect(() => {
    if (endsAt == null || paused != null || context == null) return;

    const tick = () => {
      let cursor = index;
      let deadline = endsAt;
      const now = Date.now();

      // Rattrapage : plusieurs segments ont pu s'écouler pendant que l'app dormait. On s'arrête
      // au premier MANUEL — après lui, plus rien ne s'est écoulé sans l'athlète.
      while (now >= deadline) {
        markUnit(context.blockId, segments[cursor]);
        const next = segments[cursor + 1];
        if (next == null) {
          stop();
          return;
        }
        if (next.kind === SegmentKind.MANUAL) {
          enter(segments, cursor + 1);
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
  }, [endsAt, paused, index, segments, context, markUnit, stop, enter]);

  const start = useCallback(
    (next: readonly BlockSegment[], runnerContext: RunnerContext) => {
      if (next.length === 0) return;
      setSegments(next);
      setContext(runnerContext);
      enter(next, 0);
    },
    [enter],
  );

  /**
   * « J'ai fini ma série » : le geste qui clôt un segment manuel et donne le départ du repos.
   *
   * C'est le seul endroit où l'athlète fait avancer le déroulé lui-même — et le seul où une
   * unité est cochée sans qu'aucun temps ne se soit écoulé.
   */
  const confirm = useCallback(() => {
    if (context == null) return;
    markUnit(context.blockId, segments[index]);
    if (segments[index + 1] == null) {
      stop();
      return;
    }
    enter(segments, index + 1);
  }, [context, segments, index, markUnit, stop, enter]);

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
    if (segments[index + 1] == null) {
      stop();
      return;
    }
    enter(segments, index + 1);
  }, [segments, index, stop, enter]);

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
    /** Le déroulé ATTEND l'athlète : ni compte à rebours, ni pause, seulement un geste. */
    awaiting: current?.kind === SegmentKind.MANUAL,
    isPaused: paused != null,
    /** L'échéance suivie par la notification programmée. `null` en pause. */
    deadline: paused == null ? endsAt : null,
    start,
    confirm,
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
