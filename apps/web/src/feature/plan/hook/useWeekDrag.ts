import { useState } from "react";

/** Une place dans la grille : une journée, et un rang dedans. */
export type WeekSlot = { date: string; index: number };

type DragEventLike = { preventDefault: () => void; stopPropagation: () => void };

/**
 * Le glisser-déposer d'une SEMAINE de planification (#93) — le pendant de `useReorderDrag` pour
 * une grille à deux dimensions.
 *
 * Il ne peut pas réutiliser ce hook, et ce n'est pas un oubli : `useReorderDrag` ne porte que des
 * indices, donc une seule liste. Ici une séance peut atterrir dans une AUTRE journée, et un rang
 * seul ne dit plus où. Chaque repère est donc une paire (journée, rang).
 *
 * L'état vit au niveau de la SEMAINE, ce qui borne le geste : deux semaines, ou deux cycles, ne
 * communiquent pas. Déplacer une séance d'une semaine à l'autre est un autre sujet — la route
 * serveur est d'ailleurs scopée à une semaine.
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
   * Les props d'une CARTE de séance : déposer dessus insère à SA place, et pousse le reste.
   *
   * `stopPropagation` est ce qui fait tenir l'ensemble : la carte est dans la case du jour, qui
   * est elle aussi une cible. Sans lui, l'événement remonte et la case écrase le rang visé par
   * celui de la fin de file — toute séance déposée atterrirait en dernier.
   *
   * PAS de `onDragLeave`, pour la raison qui vaut déjà dans `useReorderDrag` : il se déclenche
   * aussi en passant sur un ENFANT de la carte, donc en permanence pendant le survol.
   */
  function cardProps(date: string, index: number) {
    return {
      onDragOver: (event: DragEventLike) => {
        event.preventDefault();
        event.stopPropagation();
        setOver({ date, index });
      },
      onDrop: (event: DragEventLike) => {
        event.stopPropagation();
        drop({ date, index });
      },
    };
  }

  /**
   * Les props de la CASE d'un jour : déposer dans son espace libre met la séance en fin de file.
   *
   * C'est le seul chemin vers une journée VIDE, qui n'a aucune carte à viser — et c'est le cas le
   * plus courant du geste.
   */
  function dayProps(date: string, count: number) {
    return {
      onDragOver: (event: DragEventLike) => {
        event.preventDefault();
        setOver({ date, index: count });
      },
      onDrop: () => drop({ date, index: count }),
    };
  }

  function handleProps(date: string, index: number) {
    return { onDragStart: () => setFrom({ date, index }), onDragEnd: reset };
  }

  /** Vrai pour la carte survolée — la place où la séance atterrira. */
  function isOver(date: string, index: number): boolean {
    return from != null && over?.date === date && over.index === index && !isDragging(date, index);
  }

  /** Vrai pour la case survolée, quand le dépôt vise sa fin de file plutôt qu'une carte. */
  function isDayOver(date: string, count: number): boolean {
    return from != null && over?.date === date && over.index === count;
  }

  function isDragging(date: string, index: number): boolean {
    return from?.date === date && from.index === index;
  }

  return { cardProps, dayProps, handleProps, isOver, isDayOver, isDragging };
}
