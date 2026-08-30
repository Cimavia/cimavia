import type { ExerciseTracking } from "@cmv/shared";
import { useCallback, useState } from "react";

/** Le suivi de TOUTE une séance, indexé par identifiant d'exercice diffusé. */
export type SessionTracking = Record<string, ExerciseTracking | null>;

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
 * Le LOCAL l'emporte sur le distant : il n'est monté au serveur qu'au débrief, donc il est plus
 * récent par construction.
 */
export function useLocalTracking(sessionId: string, remote: SessionTracking) {
  const [cached, setCached] = useState<SessionTracking | null>(() => read(sessionId));
  const tracking = cached ?? remote;

  const persist = useCallback(
    (next: SessionTracking) => {
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
    (exerciseId: string, blockId: string, index: number) => {
      const forExercise = tracking[exerciseId] ?? {};
      const state = forExercise[blockId];
      const checked = state != null && "checked" in state ? state.checked : [];
      const next = checked.includes(index)
        ? checked.filter((item) => item !== index)
        : [...checked, index].sort((a, b) => a - b);

      persist({ ...tracking, [exerciseId]: { ...forExercise, [blockId]: { checked: next } } });
    },
    [tracking, persist],
  );

  /** L'AMRAP se COMPTE : son objectif est indicatif, et le compteur n'a pas de plafond. */
  const setRounds = useCallback(
    (exerciseId: string, blockId: string, rounds: number) => {
      const forExercise = tracking[exerciseId] ?? {};
      persist({
        ...tracking,
        [exerciseId]: { ...forExercise, [blockId]: { rounds: Math.max(0, rounds) } },
      });
    },
    [tracking, persist],
  );

  /**
   * Le local diffère-t-il de ce que le serveur connaît ?
   *
   * Comparé sur une forme CANONIQUE (clés triées) : deux objets identiques écrits dans un ordre
   * différent — au fil des coches d'un côté, au chargement de l'autre — ne doivent pas passer pour
   * une modification, sinon le bouton « Enregistrer » resterait actif sur une séance déjà envoyée.
   */
  const dirty = cached != null && canonical(cached) !== canonical(remote);

  /**
   * Efface le suivi local une fois qu'il est parti avec le débrief : l'écran redevient un miroir
   * du serveur, qui en est désormais le porteur.
   */
  const clear = useCallback(() => {
    setCached(null);
    try {
      window.localStorage.removeItem(key(sessionId));
    } catch {
      // Rien à réparer : la donnée est partie au serveur, c'est ce qui compte.
    }
  }, [sessionId]);

  return { tracking, toggleUnit, setRounds, clear, dirty };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value != null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, item]) => `${k}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
