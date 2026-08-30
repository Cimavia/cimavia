import type { ExerciseTracking } from "@cmv/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

/** Le suivi de TOUTE une séance, indexé par identifiant d'exercice diffusé. */
export type SessionTracking = Record<string, ExerciseTracking | null>;

const key = (sessionId: string) => `cimavia-tracking:${sessionId}`;

/**
 * Le suivi d'exécution, gardé EN LOCAL pendant la séance.
 *
 * L'athlète est souvent sans réseau en salle : cocher une série ne doit jamais dépendre d'une
 * requête. Le suivi ne franchit le réseau qu'à l'envoi du débrief — c'est aussi ce qui le rend
 * corrigeable jusqu'au dernier moment.
 *
 * Une clé par séance : les séances ne se mélangent pas, et fermer l'app entre deux exercices ne
 * perd rien.
 */
export function useLocalTracking(sessionId: string, remote: SessionTracking) {
  const [tracking, setTracking] = useState<SessionTracking>(remote);
  const [loaded, setLoaded] = useState(false);

  /**
   * Le LOCAL l'emporte au chargement : il est plus récent par construction — il n'est monté au
   * serveur qu'au débrief. Écraser avec le distant ferait perdre une séance entière de coches à
   * qui rouvre l'app avant d'avoir débriefé.
   */
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key(sessionId))
      .then((raw) => {
        if (cancelled) return;
        if (raw != null) setTracking(JSON.parse(raw) as SessionTracking);
        setLoaded(true);
      })
      // Un cache illisible n'est pas une raison de bloquer la séance : on repart du distant.
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const persist = useCallback(
    (next: SessionTracking) => {
      setTracking(next);
      // Écriture non attendue : cocher doit répondre à l'instant, pas au retour du disque.
      void AsyncStorage.setItem(key(sessionId), JSON.stringify(next));
    },
    [sessionId],
  );

  /** Bascule une unité d'un bloc. Le premier tap fait naître le suivi de cet exercice. */
  const toggleUnit = useCallback(
    (exerciseId: string, blockId: string, index: number) => {
      const forExercise = tracking[exerciseId] ?? {};
      const state = forExercise[blockId];
      const checked = state != null && "checked" in state ? state.checked : [];
      const next = checked.includes(index)
        ? checked.filter((item) => item !== index)
        : [...checked, index].sort((a, b) => a - b);

      persist({
        ...tracking,
        [exerciseId]: { ...forExercise, [blockId]: { checked: next } },
      });
    },
    [tracking, persist],
  );

  /** Le compteur d'un AMRAP : il se COMPTE, l'objectif du coach n'étant qu'indicatif. */
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

  /** Efface le suivi local une fois qu'il est parti avec le débrief. */
  const clear = useCallback(() => {
    void AsyncStorage.removeItem(key(sessionId));
  }, [sessionId]);

  return { tracking, loaded, toggleUnit, setRounds, clear };
}
