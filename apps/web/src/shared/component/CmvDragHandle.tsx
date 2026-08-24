import type { KeyboardEvent } from "react";
import { IoReorderTwo } from "react-icons/io5";

type CmvDragHandleProps = {
  label: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (direction: -1 | 1) => void;
};

/**
 * Poignée de réordonnancement, partagée par la grille de dosage et le sélecteur de métriques.
 *
 * Glisser est le geste attendu, mais il est INACCESSIBLE au clavier : la poignée est donc un
 * bouton focusable qui répond aussi aux flèches haut/bas. Deux gestes pour une même intention,
 * sans encombrer chaque ligne de deux boutons de plus.
 */
export function CmvDragHandle({
  label,
  onDragStart,
  onDragEnd,
  onMove,
}: Readonly<CmvDragHandleProps>) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onMove(event.key === "ArrowUp" ? -1 : 1);
  }

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      aria-label={label}
      className="cursor-grab px-cmv-xs text-cmv-text-lo hover:text-cmv-text-mid"
    >
      <IoReorderTwo />
    </button>
  );
}
