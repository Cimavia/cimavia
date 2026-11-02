import { sameJson } from "@cmv/shared";
import { useCallback, useRef, useState } from "react";
import { readStoredJson, removeStored, writeStoredJson } from "@/shared/lib/local-storage";

/**
 * Un suivi gardé en local jusqu'à l'envoi du débrief, sous la clé `key` — le stockage du suivi
 * par bloc (`useLocalBlockTracking`, #722).
 *
 * Même modèle que sur mobile, et pour la même raison de fond : cocher ne doit dépendre d'aucune
 * requête, et le décompte reste corrigeable jusqu'au dernier moment. Le web n'a pas le problème de
 * réseau de la salle, mais un second chemin d'écriture ferait diverger les deux surfaces sur
 * QUAND une coche devient définitive.
 */
export function useStoredTracking<T>(
  key: string,
  remote: T,
  /** Le local dit-il la même chose que le distant ? Il n'est pas « modifié » sinon. */
  same: (local: T, remote: T) => boolean = sameJson,
) {
  // `null` = rien en local, ou rien de lisible — stockage indisponible, JSON corrompu. On suit alors
  // le serveur, qui reste le porteur du suivi, plutôt que d'empêcher la séance de s'afficher.
  const [cached, setCached] = useState<T | null>(() => readStoredJson(key) as T | null);
  /**
   * Le local tel qu'il est MAINTENANT, pour `clearIf` : la réponse de l'envoi peut arriver avant
   * le rendu qui suit une coche, et `cached` ne serait alors pas encore à jour.
   */
  const latest = useRef(cached);

  const persist = useCallback(
    (next: T) => {
      latest.current = next;
      setCached(next);
      // Écriture refusée : l'état de l'écran reste juste, seul le rechargement perdrait les
      // coches. Bloquer la séance pour ça serait pire.
      writeStoredJson(key, next);
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
      // Effacement refusé, rien à réparer : la donnée est partie au serveur, c'est ce qui compte.
      removeStored(key);
    },
    [key],
  );

  return {
    tracking: cached ?? remote,
    /** Faux tant qu'il n'y a rien en local : `tracking` EST alors le distant. */
    dirty: cached != null && !same(cached, remote),
    persist,
    clearIf,
  };
}
