import {
  checkUnit as checkUnitIn,
  type SessionTracking,
  sameTracking,
  setRounds as setRoundsIn,
  toggleUnit as toggleUnitIn,
} from "@cmv/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

export type { SessionTracking };

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
 *
 * Ce que fait une coche vit dans `@cmv/shared` : seul le STOCKAGE distingue ce hook de son
 * jumeau web, et deux copies de la logique auraient fini par décompter différemment.
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
   * La valeur COURANTE, à jour dès l'écriture — `cached`, lui, ne l'est qu'au rendu suivant.
   *
   * Le rattrapage du déroulé coche plusieurs unités dans le même tic, sans rendu entre deux : parti
   * de `cached`, chaque appel repartait de la même base et effaçait le précédent — 3 × 30 s de
   * gainage passés écran éteint remontaient 1/3 (#306). `setCached(prev => …)` ne suffit pas : dès
   * le deuxième appel, React ne calcule la valeur qu'au rendu, et l'écriture disque s'y ferait.
   */
  const latest = useRef<SessionTracking | null>(null);

  /** Mémoire, écran et disque changent ENSEMBLE : `null` efface le local. */
  const write = useCallback(
    (next: SessionTracking | null) => {
      latest.current = next;
      setCached(next);
      // Écriture non attendue : cocher doit répondre à l'instant, pas au retour du disque.
      if (next == null) void AsyncStorage.removeItem(key(sessionId));
      else void AsyncStorage.setItem(key(sessionId), JSON.stringify(next));
    },
    [sessionId],
  );

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
        const stored = JSON.parse(raw) as SessionTracking;
        latest.current = stored;
        setCached(stored);
      })
      // Un cache illisible n'est pas une raison de bloquer la séance : on reste sur le distant.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const update = useCallback(
    (change: (current: SessionTracking) => SessionTracking) => {
      const current = latest.current ?? remote;
      const next = change(current);
      // Rien n'a bougé (unité déjà cochée) : une écriture disque de plus n'apporterait rien.
      if (next !== current) write(next);
    },
    [remote, write],
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
   * du serveur, qui en est désormais le porteur.
   */
  const clear = useCallback(() => write(null), [write]);

  /** Faux tant qu'il n'y a rien en local : `tracking` EST alors le distant. */
  const dirty = cached != null && !sameTracking(cached, remote);

  return { tracking, dirty, toggleUnit, checkUnit, setRounds, clear };
}
