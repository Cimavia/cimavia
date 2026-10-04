import {
  checkUnit as checkUnitIn,
  isTrackingSent,
  type SessionTracking,
  sameTracking,
  setRounds as setRoundsIn,
  toggleUnit as toggleUnitIn,
} from "@cmv/shared";
import { useCallback, useSyncExternalStore } from "react";
import {
  readLocalTracking,
  subscribeLocalTracking,
  writeLocalTracking,
} from "@/feature/plan/lib/local-tracking-store";

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
  const subscribe = useCallback(
    (listener: () => void) => subscribeLocalTracking(sessionId, listener),
    [sessionId],
  );
  /**
   * `null` = rien en local, on SUIT le distant.
   *
   * C'est ce qui rattrape une séance ouverte avant que sa requête réponde, et surtout une séance
   * déjà débriefée rouverte sur un autre appareil : garder un instantané du distant pris au premier
   * render l'aurait figée sur « aucune coche ».
   *
   * Le LOCAL l'emporte dès qu'il existe : il est plus récent par construction — il n'est monté au
   * serveur qu'au débrief. Écraser avec le distant ferait perdre une séance entière de coches à
   * qui rouvre l'app avant d'avoir débriefé.
   */
  const cached = useSyncExternalStore(subscribe, () => readLocalTracking(sessionId));
  const tracking = cached ?? remote;

  /**
   * Part de la valeur du MAGASIN, pas de `cached` : celle-ci n'est à jour qu'au rendu suivant, et
   * le rattrapage du déroulé coche plusieurs unités dans le même tic — 3 × 30 s de gainage passés
   * écran éteint remontaient 1/3 (#306).
   */
  const update = useCallback(
    (change: (current: SessionTracking) => SessionTracking) => {
      const current = readLocalTracking(sessionId) ?? remote;
      const next = change(current);
      // Rien n'a bougé (unité déjà cochée) : une écriture disque de plus n'apporterait rien.
      if (next !== current) writeLocalTracking(sessionId, next);
    },
    [sessionId, remote],
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

  /**
   * Efface le suivi local une fois qu'il est parti avec le débrief : l'écran redevient un miroir
   * du serveur, qui en est désormais le porteur. Pour TOUS les écrans de la séance, y compris
   * celui resté monté sous le débrief.
   *
   * Seulement s'il dit ENCORE ce qui est parti (#499) : une coche posée pendant l'envoi n'est pas
   * au serveur, et l'effacer la perdait sans bruit. Elle reste alors en local, à envoyer. Sans
   * suivi envoyé — la séance n'avait pas pu être chargée —, rien n'a quitté l'appareil.
   *
   * Lu dans le MAGASIN, pas dans `cached` : la coche peut précéder la réponse du même tic.
   */
  const clearIfSent = useCallback(
    (sent: SessionTracking | undefined, exercises: Parameters<typeof isTrackingSent>[2]) => {
      const current = readLocalTracking(sessionId);
      if (sent == null || current == null) return;
      if (isTrackingSent(current, sent, exercises)) writeLocalTracking(sessionId, null);
    },
    [sessionId],
  );

  /** Faux tant qu'il n'y a rien en local : `tracking` EST alors le distant. */
  const dirty = cached != null && !sameTracking(cached, remote);

  return { tracking, dirty, toggleUnit, checkUnit, setRounds, clearIfSent };
}
