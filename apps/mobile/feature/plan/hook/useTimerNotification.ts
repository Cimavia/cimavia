import { useEffect, useState } from "react";
import { cancelTimerEnd, scheduleTimerEnd } from "@/feature/plan/lib/timer-alert";

/** Une échéance à annoncer : quand, et ce que la notification doit dire. */
export type TimerAlert = { at: number; title: string; body: string };

/**
 * L'OS n'a pas besoin de nous : les notifications sont posées TOUTES à l'avance.
 *
 * Une seule ne suffit pas. Téléphone rangé, le JS est gelé : après la première, le déroulé
 * n'avance pas et plus rien n'est programmé. L'athlète ne serait prévenu que du premier repos, et
 * finirait sa séance au silence.
 *
 * Elles sont donc reposées EN BLOC dès que le déroulé change — pause, « Passer », « + 30 s ».
 * Les recalculer entièrement plutôt que rapiécer évite l'écart entre ce qui sonne et ce qui reste.
 */
export function useTimerNotification(alerts: readonly TimerAlert[]): { armed: boolean } {
  const [armed, setArmed] = useState(false);

  /**
   * Ce qui est réellement programmé, stabilisé sur le CONTENU des alertes.
   *
   * Le tableau reçu est recalculé à chaque render — quatre fois par seconde pendant un décompte.
   * En dépendre reprogrammerait tout à chaque tic. On ne le retient donc que quand son contenu
   * change, et l'effet dépend de cette copie stable.
   *
   * Ajusté PENDANT le render, pas dans un effet : c'est de l'état dérivé, et le passer par un
   * effet ferait un aller-retour de plus avant de programmer quoi que ce soit.
   */
  const key = alerts.map((alert) => `${alert.at}|${alert.title}|${alert.body}`).join("\n");
  const [syncedKey, setSyncedKey] = useState(key);
  const [scheduled, setScheduled] = useState<readonly TimerAlert[]>(alerts);
  if (key !== syncedKey) {
    setSyncedKey(key);
    setScheduled(alerts);
  }

  useEffect(() => {
    const pending = scheduled;
    if (pending.length === 0) {
      setArmed(false);
      return;
    }

    const identifiers: string[] = [];
    let cancelled = false;

    void Promise.all(
      pending.map((alert) => scheduleTimerEnd(alert.at, alert.title, alert.body)),
    ).then((ids) => {
      const kept = ids.filter((id): id is string => id != null);
      if (cancelled) {
        for (const id of kept) void cancelTimerEnd(id);
        return;
      }
      identifiers.push(...kept);
      setArmed(kept.length > 0);
    });

    return () => {
      cancelled = true;
      for (const id of identifiers) void cancelTimerEnd(id);
    };
  }, [scheduled]);

  return { armed };
}
