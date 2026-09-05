import type { WeekSlot } from "@/feature/plan/hook/useWeekDrag";

/** Le minimum qu'une séance doit porter pour être rangée : de quoi la nommer à l'API. */
type Identified = { id: string };

/** La journée à ÉCRIRE, et son contenu complet — ce que la route attend, ni plus ni moins. */
export type DroppedDay = { date: string; sessionIds: string[] };

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
  from: WeekSlot,
  to: WeekSlot,
): DroppedDay | null {
  const moved = source[from.index];
  if (moved == null) return null;

  if (from.date !== to.date) {
    if (to.index < 0 || to.index > target.length) return null;
    const arrival = [...target];
    arrival.splice(to.index, 0, moved);
    return { date: to.date, sessionIds: arrival.map((session) => session.id) };
  }

  // Le rang visé est BORNÉ avant tout calcul, et pas seulement par prudence : `splice` compte les
  // indices négatifs DEPUIS LA FIN. Sans cette garde, la flèche ↑ sur la première séance visait
  // `-1` et la déplaçait en avant-dernière place, silencieusement.
  if (to.index < 0 || to.index >= source.length) return null;

  // Le retrait AVANT l'insertion : sans lui, déposer une séance plus bas la placerait un cran trop
  // haut, son propre rang comptant encore dans les places qui la précèdent.
  const next = [...source];
  next.splice(from.index, 1);
  next.splice(to.index, 0, moved);

  if (next.every((session, index) => session.id === source[index]?.id)) return null;
  return { date: to.date, sessionIds: next.map((session) => session.id) };
}
