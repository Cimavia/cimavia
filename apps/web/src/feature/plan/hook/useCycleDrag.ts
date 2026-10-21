import type { PlanWeekDto } from "@cmv/shared";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import { useWeekDrag, type WeekSlot } from "@/feature/plan/hook/useWeekDrag";
import { dayAfterDrop } from "@/feature/plan/util/week-drop.util";

/**
 * Le glisser d'une séance dans la grille d'un cycle, et ce qu'il écrit (#689) — tenu par l'écran,
 * au-dessus des cartes de semaine, pour qu'une séance passe de l'une à l'autre.
 *
 * `weeks` est le cycle tel que l'écran le montre : c'est lui qui dit ce que chaque journée porte,
 * et à quelle version la semaine d'arrivée a été lue.
 */
export function useCycleDrag(planId: string, weeks: readonly PlanWeekDto[]) {
  const { reorderDay, isBusy } = usePlanMutations(planId);

  const sessionsOn = (slot: WeekSlot) =>
    weeks
      .find((week) => week.id === slot.weekId)
      ?.sessions.filter((session) => session.scheduledDate === slot.date) ?? [];

  // Une seule journée est écrite : celle d'arrivée, sous la version de SA semaine. Le serveur
  // retire la séance de son jour d'origine — fût-il d'une autre semaine — et l'y recolle : deux
  // écritures feraient deux notifications pour un seul geste.
  // Pendant une écriture sur le cycle — d'ici, du panneau ou de l'en-tête —, la grille affichée
  // n'est pas encore celle du serveur : un second geste la citerait et se verrait refuser comme
  // périmé (#604). Il attend que la relecture ait posé la nouvelle version.
  function onDrop(from: WeekSlot, to: WeekSlot) {
    if (isBusy) return;
    const arrival = weeks.find((week) => week.id === to.weekId);
    const day = dayAfterDrop(sessionsOn(from), sessionsOn(to), from, to);
    if (arrival == null || day == null) return;
    reorderDay.mutate({ weekId: arrival.id, expectedUpdatedAt: arrival.updatedAt, ...day });
  }

  const drag = useWeekDrag(onDrop);

  // Le chemin clavier de la poignée : un cran, DANS la journée. Sortir du jour — ou de la semaine —
  // se fait au glisser, ou par le sélecteur « Jour » du panneau, qui couvre tout le cycle (#689).
  function moveWithinDay(slot: WeekSlot, direction: -1 | 1) {
    onDrop(slot, { ...slot, index: slot.index + direction });
  }

  return { ...drag, moveWithinDay };
}

export type CycleDrag = ReturnType<typeof useCycleDrag>;
