import { useState } from "react";

/**
 * Une place dans la grille du cycle : une semaine, une journée, et un rang dedans (#689).
 *
 * La semaine est redondante pour REPÉRER la place — dans un cycle, une date n'appartient qu'à une
 * semaine —, mais pas pour l'écrire : la route d'ordre est adressée à la semaine d'arrivée, et cite
 * sa version.
 */
export type WeekSlot = { weekId: string; date: string; index: number };

type DragEventLike = { preventDefault: () => void; stopPropagation: () => void };

const sameSlot = (left: WeekSlot | null, right: WeekSlot) =>
  left?.date === right.date && left.index === right.index;

/**
 * Le glisser-déposer de la grille d'un CYCLE (#93, élargi en #689) — le pendant de
 * `useReorderDrag` pour une grille à deux dimensions.
 *
 * Il ne peut pas réutiliser ce hook, et ce n'est pas un oubli : `useReorderDrag` ne porte que des
 * indices, donc une seule liste. Ici une séance peut atterrir dans une AUTRE journée, d'une autre
 * semaine, et un rang seul ne dit plus où. Chaque repère est donc une place (`WeekSlot`).
 *
 * L'état vit au niveau du CYCLE, au-dessus des cartes de semaine : c'est ce qui laisse une séance
 * passer de l'une à l'autre. Deux cycles, eux, ne communiquent pas — changer de cycle peut changer
 * d'athlète, c'est un autre sujet (#689).
 *
 * Les places sont comparées par leur seule date : unique dans le cycle, elle suffit.
 */
export function useWeekDrag(onDrop: (from: WeekSlot, to: WeekSlot) => void) {
  const [from, setFrom] = useState<WeekSlot | null>(null);
  const [over, setOver] = useState<WeekSlot | null>(null);

  function reset() {
    setFrom(null);
    setOver(null);
  }

  function drop(to: WeekSlot) {
    if (from != null) onDrop(from, to);
    reset();
  }

  /**
   * `dragover` tombe en continu pendant le survol. L'état vivant au niveau du cycle, un nouvel
   * objet à chaque événement redessinerait toutes ses semaines — jusqu'à 52 — pour une place qui
   * n'a pas changé. On garde donc l'objet en place tant qu'il désigne la même.
   */
  function hover(slot: WeekSlot) {
    setOver((current) => (sameSlot(current, slot) ? current : slot));
  }

  /**
   * Les props d'une CARTE de séance : déposer dessus insère à SA place, et pousse le reste.
   *
   * `stopPropagation` est ce qui fait tenir l'ensemble : la carte est dans la case du jour, qui
   * est elle aussi une cible. Sans lui, l'événement remonte et la case écrase le rang visé par
   * celui de la fin de file — toute séance déposée atterrirait en dernier.
   *
   * PAS de `onDragLeave`, pour la raison qui vaut déjà dans `useReorderDrag` : il se déclenche
   * aussi en passant sur un ENFANT de la carte, donc en permanence pendant le survol.
   */
  function cardProps(slot: WeekSlot) {
    return {
      onDragOver: (event: DragEventLike) => {
        event.preventDefault();
        event.stopPropagation();
        hover(slot);
      },
      onDrop: (event: DragEventLike) => {
        event.stopPropagation();
        drop(slot);
      },
    };
  }

  /**
   * Les props de la CASE d'un jour : déposer dans son espace libre met la séance en fin de file —
   * `end` est donc la place qui suit la dernière séance.
   *
   * C'est le seul chemin vers une journée VIDE, qui n'a aucune carte à viser — et c'est le cas le
   * plus courant du geste.
   */
  function dayProps(end: WeekSlot) {
    return {
      onDragOver: (event: DragEventLike) => {
        event.preventDefault();
        hover(end);
      },
      onDrop: () => drop(end),
    };
  }

  function handleProps(slot: WeekSlot) {
    return { onDragStart: () => setFrom(slot), onDragEnd: reset };
  }

  /** Vrai pour la carte survolée — la place où la séance atterrira. */
  function isOver(slot: WeekSlot): boolean {
    return from != null && sameSlot(over, slot) && !isDragging(slot);
  }

  /** Vrai pour la case survolée, quand le dépôt vise sa fin de file plutôt qu'une carte. */
  function isDayOver(end: WeekSlot): boolean {
    return from != null && sameSlot(over, end);
  }

  function isDragging(slot: WeekSlot): boolean {
    return sameSlot(from, slot);
  }

  return { cardProps, dayProps, handleProps, isOver, isDayOver, isDragging };
}
