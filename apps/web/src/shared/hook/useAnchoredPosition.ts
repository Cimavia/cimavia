import { type RefObject, useEffect, useState } from "react";

type Position = { top: number; left: number };

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
 */
export function useAnchoredPosition(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
): Position | undefined {
  const [position, setPosition] = useState<Position>();

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect != null) setPosition({ top: rect.bottom + GAP, left: rect.left });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, open]);

  return open ? position : undefined;
}
