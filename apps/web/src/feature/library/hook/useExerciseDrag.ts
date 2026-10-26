import { useState } from "react";

/** Un événement de glisser, réduit à ce que le hook en fait. */
type DragEventLike = { preventDefault: () => void; stopPropagation: () => void };

/**
 * Glisser un exercice d'un bloc à l'autre (#719) : on le dépose SUR un exercice, qu'il remplace à
 * son rang, ou au bout d'un bloc. Le rang est compté une fois l'exercice retiré de sa place
 * (`movedExercise`) : déposé sur son voisin du dessous, il prend sa place, comme dans une liste.
 *
 * À côté de `useReorderDrag`, qui range les blocs : un exercice glissé ne doit pas déplacer le bloc
 * qui le contient. Ses cibles arrêtent donc le dépôt, et laissent passer celui d'un bloc.
 */
export function useExerciseDrag(onMove: (key: string, blockId: string, index: number) => void) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function reset() {
    setDragged(null);
    setOver(null);
  }

  /** Les props de la cible « rang `index` du bloc `blockId` » — un exercice, ou le bout du bloc. */
  function targetProps(blockId: string, index: number) {
    const target = `${blockId}:${index}`;
    return {
      onDragOver: (event: DragEventLike) => {
        if (dragged == null) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(target);
      },
      onDrop: (event: DragEventLike) => {
        if (dragged == null) return;
        event.stopPropagation();
        onMove(dragged, blockId, index);
        reset();
      },
    };
  }

  function handleProps(key: string) {
    return { onDragStart: () => setDragged(key), onDragEnd: reset };
  }

  return {
    targetProps,
    handleProps,
    isOver: (blockId: string, index: number) => dragged != null && over === `${blockId}:${index}`,
    isDragging: (key: string) => dragged === key,
  };
}

export type ExerciseDrag = ReturnType<typeof useExerciseDrag>;
