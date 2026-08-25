import { useState } from "react";

/**
 * L'état d'un glisser-déposer de réordonnancement, partagé par la grille de dosage, l'ordre des
 * colonnes et les paliers d'une échelle.
 *
 * Il porte DEUX indices : celui qu'on déplace et celui qu'on survole. Sans le second, rien à
 * l'écran ne dit où l'élément va atterrir.
 */
export function useReorderDrag(onMove: (from: number, to: number) => void) {
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  function reset() {
    setFrom(null);
    setOver(null);
  }

  /**
   * Les props à étaler sur la ligne d'indice `index`.
   *
   * PAS de `onDragLeave` : il se déclenche aussi quand le pointeur passe sur un ENFANT de la
   * ligne — poignée, cellule, bouton — donc en permanence pendant le survol. Le repère
   * s'effaçait aussitôt affiché. C'est le prochain `onDragOver` qui le déplace, et le dépôt ou la
   * fin du glisser qui l'efface.
   */
  function rowProps(index: number) {
    return {
      onDragOver: (event: { preventDefault: () => void }) => {
        event.preventDefault();
        setOver(index);
      },
      onDrop: () => {
        if (from != null && from !== index) onMove(from, index);
        reset();
      },
    };
  }

  function handleProps(index: number) {
    return { onDragStart: () => setFrom(index), onDragEnd: reset };
  }

  /**
   * Vrai pour la ligne survolée pendant un glisser — la place où l'élément atterrira.
   *
   * L'état plutôt qu'une CLASSE : les listes qui ont déjà un fond (`bg-cmv-surface`) verraient
   * une classe de teinte entrer en conflit avec lui, à spécificité égale, et c'est l'ordre du
   * fichier CSS qui trancherait. En rendant l'état, chaque appelant choisit UN fond, et le
   * conflit n'existe plus. C'est la troisième forme de ce repère : les deux premières, en
   * `border-t-2` puis en `outline`, se faisaient écraser sans que rien ne le signale.
   */
  function isOver(index: number): boolean {
    return from != null && over === index && from !== index;
  }

  function isDragging(index: number): boolean {
    return from === index;
  }

  return { rowProps, handleProps, isOver, isDragging };
}
