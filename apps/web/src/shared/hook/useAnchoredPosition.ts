import { required } from "@cmv/shared";
import { type RefObject, useEffect, useState } from "react";

type Position = { top: number; left: number } | { top: number; right: number };

/** Le bord du bouton auquel le panneau s'aligne : à gauche, ou à droite pour un bouton en bout de ligne. */
type Align = "start" | "end";

const GAP = 4;

/**
 * La position d'un panneau flottant, calée sous son bouton d'ancrage.
 *
 * Le panneau est en `fixed` parce que son conteneur défile horizontalement et rognerait tout
 * enfant débordant. Mais `fixed` ne suit RIEN : sans ce recalcul, le panneau reste où il était
 * pendant que la page défile sous lui, et se retrouve n'importe où à l'écran.
 *
 * Écoute en phase de CAPTURE : le défilement qui compte est souvent celui d'un conteneur interne,
 * et un `scroll` d'élément ne remonte pas jusqu'à `window` en phase de bouillonnement.
 *
 * Aligné à `end`, le panneau s'ouvre vers la gauche : un menu ⋯ en bout de carte déborderait sinon
 * de l'écran.
 */
export function useAnchoredPosition(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  align: Align = "start",
): Position | undefined {
  const [position, setPosition] = useState<Position>();

  useEffect(() => {
    if (!open) return;

    const update = () => {
      // L'ancre est le déclencheur, monté avant le panneau qu'il ouvre.
      const rect = required(anchor.current, "panneau ouvert sans ancre").getBoundingClientRect();
      setPosition(
        align === "start"
          ? { top: rect.bottom + GAP, left: rect.left }
          : { top: rect.bottom + GAP, right: window.innerWidth - rect.right },
      );
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, open, align]);

  return open ? position : undefined;
}
