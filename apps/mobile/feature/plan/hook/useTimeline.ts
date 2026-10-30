import { required } from "@cmv/shared";
import { useCallback, useEffect, useRef, useState } from "react";

/** Une étape d'un déroulé : sa durée, `0` pour une étape qui attend un geste. */
type Timed = { readonly seconds: number };

/**
 * Un déroulé, étape après étape — le moteur commun à l'ancien déroulé d'un exercice
 * (`useSegmentRunner`) et au chrono d'un bloc (#722).
 *
 * Le temps se lit sur une échéance ABSOLUE, jamais en décrémentant. Ici c'est vital : l'app est
 * gelée en arrière-plan, et l'athlète qui rouvre au bout de trois étapes doit retrouver la bonne,
 * pas celle qu'il avait quittée. D'où le rattrapage en boucle plutôt qu'un simple `index + 1`.
 *
 * `waits` dit quelles étapes attendent l'athlète : pas d'échéance, le déroulé s'y arrête jusqu'à
 * `confirm`. `onDone` reçoit chaque étape achevée — écoulée ou confirmée, pas passée.
 */
export function useTimeline<S extends Timed, C>(
  waits: (step: S) => boolean,
  onDone?: (context: C, step: S) => void,
) {
  const [steps, setSteps] = useState<readonly S[]>([]);
  const [context, setContext] = useState<C | null>(null);
  const [index, setIndex] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [paused, setPaused] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const waitsRef = useRef(waits);
  waitsRef.current = waits;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const stop = useCallback(() => {
    setSteps([]);
    setContext(null);
    setIndex(0);
    setEndsAt(null);
    setPaused(null);
    setRemaining(0);
  }, []);

  const finish = useCallback((runContext: C, step: S | undefined) => {
    if (step != null) doneRef.current?.(runContext, step);
  }, []);

  /** Avance à l'étape `cursor`. Une étape qui attend n'a pas d'échéance : `endsAt` reste `null`. */
  const enter = useCallback((next: readonly S[], cursor: number) => {
    // Chaque appelant vérifie d'abord que l'étape visée existe.
    const step = required(next[cursor], "curseur hors déroulé");
    setIndex(cursor);
    setPaused(null);
    setRemaining(step.seconds);
    setEndsAt(waitsRef.current(step) ? null : Date.now() + step.seconds * 1000);
  }, []);

  useEffect(() => {
    if (endsAt == null || paused != null || context == null) return;

    const tick = () => {
      let cursor = index;
      let deadline = endsAt;
      const now = Date.now();

      // Rattrapage : plusieurs étapes ont pu s'écouler pendant que l'app dormait. On s'arrête à la
      // première qui attend — après elle, plus rien ne s'est écoulé sans l'athlète.
      while (now >= deadline) {
        finish(context, steps[cursor]);
        const next = steps[cursor + 1];
        if (next == null) {
          stop();
          return;
        }
        if (waitsRef.current(next)) {
          enter(steps, cursor + 1);
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
  }, [endsAt, paused, index, steps, context, finish, stop, enter]);

  const start = useCallback(
    (next: readonly S[], runContext: C) => {
      if (next.length === 0) return;
      setSteps(next);
      setContext(runContext);
      enter(next, 0);
    },
    [enter],
  );

  /** « J'ai fini » : le geste qui clôt une étape en attente et donne le départ de la suivante. */
  const confirm = useCallback(() => {
    if (context == null) return;
    finish(context, steps[index]);
    if (steps[index + 1] == null) {
      stop();
      return;
    }
    enter(steps, index + 1);
  }, [context, steps, index, finish, stop, enter]);

  const pause = useCallback(() => {
    if (endsAt == null) return;
    setPaused(Math.max(0, endsAt - Date.now()));
  }, [endsAt]);

  const resume = useCallback(() => {
    if (paused == null) return;
    setEndsAt(Date.now() + paused);
    setPaused(null);
  }, [paused]);

  /** « Passer » : on saute sans achever l'étape — une étape écourtée n'est pas faite. */
  const skip = useCallback(() => {
    if (steps[index + 1] == null) {
      stop();
      return;
    }
    enter(steps, index + 1);
  }, [steps, index, stop, enter]);

  const add = useCallback((seconds: number) => {
    setEndsAt((current) => (current == null ? null : current + seconds * 1000));
    setPaused((current) => (current == null ? null : current + seconds * 1000));
  }, []);

  const current = steps[index] ?? null;

  return {
    context,
    segments: steps,
    index,
    current,
    remaining,
    /** Le total de l'étape courante, pour la barre de progression. */
    total: current?.seconds ?? 0,
    /** Ce qu'il reste sur TOUT le déroulé — « Reste 7'18 » de la maquette. */
    totalRemaining: remaining + sumSeconds(steps.slice(index + 1)),
    active: context != null,
    /** Le déroulé ATTEND l'athlète : ni compte à rebours, ni pause, seulement un geste. */
    awaiting: current != null && waits(current),
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

function sumSeconds(steps: readonly Timed[]): number {
  return steps.reduce((total, step) => total + step.seconds, 0);
}
