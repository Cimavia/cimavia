import {
  isTrackingSent,
  type SessionTracking,
  sameTracking,
  setRounds as setRoundsIn,
  toggleUnit as toggleUnitIn,
} from "@cmv/shared";
import { useCallback } from "react";
import { useStoredTracking } from "@/feature/plan/hook/useStoredTracking";

export type { SessionTracking };

/**
 * Le suivi d'exécution par exercice, gardé en local jusqu'à l'envoi du débrief (`useStoredTracking`).
 *
 * Ce que fait une coche vit dans `@cmv/shared` : seul le STOCKAGE distingue ce hook de son jumeau
 * mobile.
 */
export function useLocalTracking(sessionId: string, remote: SessionTracking) {
  const { tracking, cached, persist, clearIf } = useStoredTracking(
    `cimavia-tracking:${sessionId}`,
    remote,
  );

  const toggleUnit = useCallback(
    (exerciseId: string, blockId: string, index: number) =>
      persist(toggleUnitIn(tracking, exerciseId, blockId, index)),
    [tracking, persist],
  );

  const setRounds = useCallback(
    (exerciseId: string, blockId: string, rounds: number) =>
      persist(setRoundsIn(tracking, exerciseId, blockId, rounds)),
    [tracking, persist],
  );

  /** Sans suivi envoyé — la séance n'avait pas pu être chargée —, rien n'a quitté le navigateur. */
  const clearIfSent = useCallback(
    (sent: SessionTracking | undefined, exercises: Parameters<typeof isTrackingSent>[2]) => {
      if (sent != null) clearIf((current) => isTrackingSent(current, sent, exercises));
    },
    [clearIf],
  );

  /** Faux tant qu'il n'y a rien en local : `tracking` EST alors le distant. */
  const dirty = cached != null && !sameTracking(cached, remote);

  return { tracking, toggleUnit, setRounds, clearIfSent, dirty };
}
