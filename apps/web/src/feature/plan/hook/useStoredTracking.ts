import { useCallback, useRef, useState } from "react";

/** `null` = rien en local. On suit alors le serveur, qui reste le porteur du suivi. */
function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    // Stockage indisponible — navigation privée, quota, JSON corrompu : on repart du serveur
    // plutôt que d'empêcher la séance de s'afficher.
    return null;
  }
}

/**
 * Un suivi gardé en local jusqu'à l'envoi du débrief, sous la clé `key` — le stockage commun au
 * suivi par exercice (`useLocalTracking`) et au suivi par bloc (`useLocalBlockTracking`, #722).
 *
 * Même modèle que sur mobile, et pour la même raison de fond : cocher ne doit dépendre d'aucune
 * requête, et le décompte reste corrigeable jusqu'au dernier moment. Le web n'a pas le problème de
 * réseau de la salle, mais un second chemin d'écriture ferait diverger les deux surfaces sur
 * QUAND une coche devient définitive.
 */
export function useStoredTracking<T>(key: string, remote: T) {
  const [cached, setCached] = useState<T | null>(() => read<T>(key));
  /**
   * Le local tel qu'il est MAINTENANT, pour `clearIf` : la réponse de l'envoi peut arriver avant
   * le rendu qui suit une coche, et `cached` ne serait alors pas encore à jour.
   */
  const latest = useRef(cached);

  const persist = useCallback(
    (next: T) => {
      latest.current = next;
      setCached(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Écriture refusée : l'état de l'écran reste juste, seul le rechargement perdrait les
        // coches. Bloquer la séance pour ça serait pire.
      }
    },
    [key],
  );

  /**
   * Efface le local une fois parti avec le débrief : l'écran redevient un miroir du serveur, qui
   * en est désormais le porteur.
   *
   * Seulement s'il dit ENCORE ce qui est parti (#499) — `isSent` en juge : une coche posée pendant
   * l'envoi n'est pas au serveur, et l'effacer la perdait sans bruit. Elle reste alors en local, à
   * envoyer.
   */
  const clearIf = useCallback(
    (isSent: (current: T) => boolean) => {
      const current = latest.current;
      if (current == null || !isSent(current)) return;
      latest.current = null;
      setCached(null);
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Rien à réparer : la donnée est partie au serveur, c'est ce qui compte.
      }
    },
    [key],
  );

  return { tracking: cached ?? remote, cached, persist, clearIf };
}
