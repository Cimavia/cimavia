import { useEffect } from "react";
import { cancelTimerEnd, scheduleTimerEnd } from "@/feature/plan/lib/timer-alert";

/**
 * Maintient UNE notification programmée sur l'échéance courante du minuteur.
 *
 * Piloté par l'échéance et non par les gestes : pause, reprise, « Passer » et « + 30 s » changent
 * tous `deadline`, et l'effet reprogramme ce qu'il faut sans que chaque bouton ait à y penser.
 * `null` — aucun timer, ou timer en pause — n'a rien de programmé.
 */
export function useTimerNotification(deadline: number | null, title: string, body: string): void {
  useEffect(() => {
    if (deadline == null) return;

    let identifier: string | null = null;
    let cancelled = false;

    void scheduleTimerEnd(deadline, title, body).then((id) => {
      // Programmée après coup : l'échéance a pu changer entre-temps, on la retire aussitôt.
      if (id == null) return;
      if (cancelled) void cancelTimerEnd(id);
      else identifier = id;
    });

    return () => {
      cancelled = true;
      if (identifier != null) void cancelTimerEnd(identifier);
    };
  }, [deadline, title, body]);
}
