import {
  isTrackingSent,
  type SessionTracking,
  sameTracking,
  setRounds as setRoundsIn,
  toggleUnit as toggleUnitIn,
} from "@cmv/shared";
import { useCallback, useRef, useState } from "react";

export type { SessionTracking };

const key = (sessionId: string) => `cimavia-tracking:${sessionId}`;

/** `null` = rien en local. On suit alors le serveur, qui reste le porteur du suivi. */
function read(sessionId: string): SessionTracking | null {
  try {
    const raw = window.localStorage.getItem(key(sessionId));
    return raw == null ? null : (JSON.parse(raw) as SessionTracking);
  } catch {
    // Stockage indisponible — navigation privée, quota, JSON corrompu : on repart du serveur
    // plutôt que d'empêcher la séance de s'afficher.
    return null;
  }
}

/**
 * Le suivi d'exécution, gardé en local jusqu'à l'envoi du débrief.
 *
 * Même modèle que sur mobile, et pour la même raison de fond : cocher ne doit dépendre d'aucune
 * requête, et le décompte reste corrigeable jusqu'au dernier moment. Le web n'a pas le problème de
 * réseau de la salle, mais un second chemin d'écriture ferait diverger les deux surfaces sur
 * QUAND une coche devient définitive.
 *
 * Ce que fait une coche vit dans `@cmv/shared` : seul le STOCKAGE distingue ce hook de son jumeau
 * mobile.
 */
export function useLocalTracking(sessionId: string, remote: SessionTracking) {
  const [cached, setCached] = useState<SessionTracking | null>(() => read(sessionId));
  const tracking = cached ?? remote;
  /**
   * Le local tel qu'il est MAINTENANT, pour `clearIfSent` : la réponse de l'envoi peut arriver
   * avant le rendu qui suit une coche, et `cached` ne serait alors pas encore à jour.
   */
  const latest = useRef(cached);

  const persist = useCallback(
    (next: SessionTracking) => {
      latest.current = next;
      setCached(next);
      try {
        window.localStorage.setItem(key(sessionId), JSON.stringify(next));
      } catch {
        // Écriture refusée : l'état de l'écran reste juste, seul le rechargement perdrait les
        // coches. Bloquer la séance pour ça serait pire.
      }
    },
    [sessionId],
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

  /**
   * Efface le suivi local une fois qu'il est parti avec le débrief : l'écran redevient un miroir
   * du serveur, qui en est désormais le porteur.
   *
   * Seulement s'il dit ENCORE ce qui est parti (#499) : une coche posée pendant l'envoi n'est pas
   * au serveur, et l'effacer la perdait sans bruit. Elle reste alors en local, à envoyer. Sans
   * suivi envoyé — la séance n'avait pas pu être chargée —, rien n'a quitté le navigateur.
   */
  const clearIfSent = useCallback(
    (sent: SessionTracking | undefined, exercises: readonly { id: string }[]) => {
      const current = latest.current;
      if (sent == null || current == null || !isTrackingSent(current, sent, exercises)) return;
      latest.current = null;
      setCached(null);
      try {
        window.localStorage.removeItem(key(sessionId));
      } catch {
        // Rien à réparer : la donnée est partie au serveur, c'est ce qui compte.
      }
    },
    [sessionId],
  );

  /** Faux tant qu'il n'y a rien en local : `tracking` EST alors le distant. */
  const dirty = cached != null && !sameTracking(cached, remote);

  return { tracking, toggleUnit, setRounds, clearIfSent, dirty };
}
