import { sameJson } from "@cmv/shared";
import { useCallback, useSyncExternalStore } from "react";
import type { LocalStore } from "@/feature/plan/lib/local-tracking-store";

/**
 * Un suivi gardé EN LOCAL jusqu'au débrief, dans l'un des magasins de séance — le socle commun au
 * suivi par exercice (`useLocalTracking`) et au suivi par bloc (`useLocalBlockTracking`, #722).
 */
export function useStoredTracking<T>(store: LocalStore<T>, sessionId: string, remote: T) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(sessionId, listener),
    [store, sessionId],
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
  const cached = useSyncExternalStore(subscribe, () => store.read(sessionId));

  /**
   * Part de la valeur du MAGASIN, pas de `cached` : celle-ci n'est à jour qu'au rendu suivant, et
   * le rattrapage du déroulé coche plusieurs unités dans le même tic — 3 × 30 s de gainage passés
   * écran éteint remontaient 1/3 (#306).
   */
  const update = useCallback(
    (change: (current: T) => T) => {
      const current = store.read(sessionId) ?? remote;
      const next = change(current);
      // Rien n'a bougé (unité déjà cochée) : une écriture disque de plus n'apporterait rien.
      if (next !== current) store.write(sessionId, next);
    },
    [store, sessionId, remote],
  );

  /**
   * Efface le suivi local une fois qu'il est parti avec le débrief : l'écran redevient un miroir
   * du serveur, qui en est désormais le porteur. Pour TOUS les écrans de la séance, y compris
   * celui resté monté sous le débrief.
   *
   * Seulement s'il dit ENCORE ce qui est parti (#499) — `isSent` en juge : une coche posée pendant
   * l'envoi n'est pas au serveur, et l'effacer la perdait sans bruit. Elle reste alors en local, à
   * envoyer. Sans suivi envoyé — la séance n'avait pas pu être chargée —, rien n'a quitté
   * l'appareil.
   *
   * Lu dans le MAGASIN, pas dans `cached` : la coche peut précéder la réponse du même tic.
   */
  const clearIf = useCallback(
    (sent: T | undefined, isSent: (current: T, sent: T) => boolean) => {
      const current = store.read(sessionId);
      if (sent == null || current == null) return;
      if (isSent(current, sent)) store.write(sessionId, null);
    },
    [store, sessionId],
  );

  return {
    tracking: cached ?? remote,
    /** Faux tant qu'il n'y a rien en local : `tracking` EST alors le distant. */
    dirty: cached != null && !sameJson(cached, remote),
    update,
    clearIf,
  };
}
