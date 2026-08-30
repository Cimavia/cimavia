import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Un compte à rebours, lancé à la demande.
 *
 * **Ne démarre JAMAIS seul.** L'athlète décide quand son repos commence — le déclencher à sa place
 * en ferait un chronomètre qui court pendant qu'il range son matériel.
 *
 * Le temps restant se calcule depuis une échéance ABSOLUE, jamais en décrémentant un compteur :
 * un intervalle de rendu ne tient pas la seconde, et l'app mise en arrière-plan gèle ses timers.
 * Au retour, l'écart est rattrapé d'un coup.
 */
export function useCountdown(onDone: () => void) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (endsAt == null || paused != null) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setEndsAt(null);
        doneRef.current();
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, paused]);

  const start = useCallback((seconds: number) => {
    setPaused(null);
    setRemaining(seconds);
    setEndsAt(Date.now() + seconds * 1000);
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

  /** « Passer » : on arrête sans prévenir — le repos écourté est une décision, pas une fin. */
  const skip = useCallback(() => {
    setEndsAt(null);
    setPaused(null);
    setRemaining(0);
  }, []);

  const add = useCallback((seconds: number) => {
    setEndsAt((current) => (current == null ? null : current + seconds * 1000));
  }, []);

  return {
    remaining,
    /**
     * L'échéance ABSOLUE en cours, ou `null` — timer arrêté ou en pause. C'est ce que suit la
     * notification programmée : elle n'a rien à savoir des gestes, seulement de la date de fin.
     */
    deadline: paused == null ? endsAt : null,
    running: endsAt != null && paused == null,
    active: endsAt != null || paused != null,
    isPaused: paused != null,
    start,
    pause,
    resume,
    skip,
    add,
  };
}
