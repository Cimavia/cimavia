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
  /**
   * `null` = rien en local, on SUIT le distant.
   *
   * C'est ce qui rattrape une séance ouverte avant que sa requête réponde, et surtout une séance
   * déjà débriefée rouverte sur un autre appareil : garder un instantané du distant pris au premier
   * render l'aurait figée sur « aucune coche ».
   */
  const [cached, setCached] = useState<SessionTracking | null>(null);
  const tracking = cached ?? remote;

  /**
   * Le LOCAL l'emporte au chargement : il est plus récent par construction — il n'est monté au
   * serveur qu'au débrief. Écraser avec le distant ferait perdre une séance entière de coches à
   * qui rouvre l'app avant d'avoir débriefé.
   */
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key(sessionId))
      .then((raw) => {
        if (cancelled || raw == null) return;
        setCached(JSON.parse(raw) as SessionTracking);
      })
      // Un cache illisible n'est pas une raison de bloquer la séance : on reste sur le distant.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const persist = useCallback(
    (next: SessionTracking) => {
      setCached(next);
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

  /**
   * Coche une unité SANS la décocher si elle l'est déjà.
   *
   * C'est ce dont le déroulé automatique a besoin : il coche au fil des segments, et l'effort
   * puis le repos d'une même série passent tous les deux par là. Un `toggle` la décocherait au
   * second appel — l'athlète verrait sa série s'effacer toute seule.
   */
  const checkUnit = useCallback(
    (exerciseId: string, blockId: string, index: number) => {
      const forExercise = tracking[exerciseId] ?? {};
      const state = forExercise[blockId];
      const checked = state != null && "checked" in state ? state.checked : [];
      if (checked.includes(index)) return;

      persist({
        ...tracking,
        [exerciseId]: {
          ...forExercise,
          [blockId]: { checked: [...checked, index].sort((a, b) => a - b) },
        },
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

  /**
   * Efface le suivi local une fois qu'il est parti avec le débrief : l'écran redevient un miroir
   * du serveur, qui en est désormais le porteur.
   */
  const clear = useCallback(() => {
    setCached(null);
    void AsyncStorage.removeItem(key(sessionId));
  }, [sessionId]);

  /**
   * Le local diffère-t-il de ce que le serveur connaît ?
   *
   * Comparé sur une forme CANONIQUE (clés triées) : deux objets identiques écrits dans un ordre
   * différent — au fil des coches d'un côté, au chargement de l'autre — ne doivent pas passer pour
   * une modification. Faux tant qu'il n'y a rien en local : `tracking` EST alors le distant.
   */
  const dirty = cached != null && canonical(cached) !== canonical(remote);

  return { tracking, dirty, toggleUnit, checkUnit, setRounds, clear };
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
