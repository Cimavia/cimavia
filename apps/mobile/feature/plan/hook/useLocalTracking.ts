import {
  checkUnit as checkUnitIn,
  isTrackingSent,
  type SessionTracking,
  setRounds as setRoundsIn,
  toggleUnit as toggleUnitIn,
} from "@cmv/shared";
import { useCallback } from "react";
import { useStoredTracking } from "@/feature/plan/hook/useStoredTracking";
import { exerciseTrackingStore } from "@/feature/plan/lib/local-tracking-store";

export type { SessionTracking };

/**
 * Le suivi d'exécution, gardé EN LOCAL pendant la séance.
 *
 * L'athlète est souvent sans réseau en salle : cocher une série ne doit jamais dépendre d'une
 * requête. Le suivi ne franchit le réseau qu'à l'envoi du débrief — c'est aussi ce qui le rend
 * corrigeable jusqu'au dernier moment.
 *
 * Une clé par séance : les séances ne se mélangent pas, et fermer l'app entre deux exercices ne
 * perd rien. Tous les écrans d'une même séance lisent la MÊME valeur (#346) : le magasin
 * (`local-tracking-store`) en tient une par séance, et ce hook n'en est que la lecture.
 *
 * Ce que fait une coche vit dans `@cmv/shared` : seul le STOCKAGE distingue ce hook de son
 * jumeau web, et deux copies de la logique auraient fini par décompter différemment.
 */
export function useLocalTracking(sessionId: string, remote: SessionTracking) {
  const { tracking, dirty, update, clearIf } = useStoredTracking(
    exerciseTrackingStore,
    sessionId,
    remote,
  );

  const toggleUnit = useCallback(
    (exerciseId: string, blockId: string, index: number) =>
      update((current) => toggleUnitIn(current, exerciseId, blockId, index)),
    [update],
  );

  const checkUnit = useCallback(
    (exerciseId: string, blockId: string, index: number) =>
      update((current) => checkUnitIn(current, exerciseId, blockId, index)),
    [update],
  );

  const setRounds = useCallback(
    (exerciseId: string, blockId: string, rounds: number) =>
      update((current) => setRoundsIn(current, exerciseId, blockId, rounds)),
    [update],
  );

  const clearIfSent = useCallback(
    (sent: SessionTracking | undefined, exercises: Parameters<typeof isTrackingSent>[2]) =>
      clearIf(sent, (current, payload) => isTrackingSent(current, payload, exercises)),
    [clearIf],
  );

  return { tracking, dirty, toggleUnit, checkUnit, setRounds, clearIfSent };
}
