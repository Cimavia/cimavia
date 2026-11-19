import { movedItem } from "@cmv/shared";
import type { WeekSlot } from "@/feature/plan/hook/useWeekDrag";

/** Le minimum qu'une séance doit porter pour être rangée : de quoi la nommer à l'API. */
type Identified = { id: string };

/** La journée à ÉCRIRE, et son contenu complet — ce que la route attend, ni plus ni moins. */
export type DroppedDay = { date: string; sessionIds: string[] };

/**
 * Une place, sans sa semaine : le calcul n'en a pas besoin (#689). Dans un cycle, deux dates
 * différentes sont deux journées différentes, qu'elles soient ou non de la même semaine.
 */
type DayPlace = Pick<WeekSlot, "date" | "index">;

/**
 * Ce que devient la journée d'ARRIVÉE après un dépôt (#93).
 *
 * Une seule journée est écrite, jamais deux : le tableau DÉFINIT le contenu du jour visé, et le
 * serveur retire de lui-même la séance de son jour d'origine puis l'y recolle. Envoyer aussi la
 * journée de départ serait une seconde écriture, donc une seconde notification pour un seul geste.
 *
 * `null` quand rien ne change — déposer une séance sur elle-même, ou la monter alors qu'elle est
 * déjà en tête. Écrire quand même coûterait à l'athlète d'un cycle diffusé une notification pour
 * un geste sans effet.
 */
export function dayAfterDrop(
  source: readonly Identified[],
  target: readonly Identified[],
  from: DayPlace,
  to: DayPlace,
): DroppedDay | null {
  if (from.date === to.date) {
    // `movedItem` borne les deux rangs (la flèche ↑ sur la première séance vise `-1`) et ne voit
    // rien à déplacer quand la séance retombe à sa place : dans tous ces cas, rien à écrire.
    const next = movedItem(source, from.index, to.index);
    return next == null ? null : { date: to.date, sessionIds: next.map((session) => session.id) };
  }

  const moved = source[from.index];
  if (moved == null || to.index < 0 || to.index > target.length) return null;
  const arrival = [...target];
  arrival.splice(to.index, 0, moved);
  return { date: to.date, sessionIds: arrival.map((session) => session.id) };
}
