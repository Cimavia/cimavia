import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/util/cn.util";
import { clampSize, type Size } from "@/shared/util/resize.util";

// Un pas de flèche, et un pas avec Maj — de 320 à 1000 px en une dizaine d'appuis.
const STEP = 16;
const SHIFT_STEP = STEP * 4;

type CmvResizeHandleProps = {
  /** `x` : un bord, la largeur seule ; `xy` : un coin, la largeur et la hauteur. */
  axis: "x" | "xy";
  size: Size;
  min: Size;
  max: Size;
  /** La taille voulue, déjà ramenée dans `[min, max]`. */
  onResize: (size: Size) => void;
  /** La place de la poignée sur son panneau (`absolute …`). */
  className?: string;
};

const AXIS_CLASSES: Record<CmvResizeHandleProps["axis"], string> = {
  x: "w-2 cursor-ew-resize hover:bg-cmv-border-hi",
  xy: "size-4 cursor-nesw-resize",
};

/**
 * La poignée d'un panneau ANCRÉ À DROITE (#695) : elle tient son bord gauche, ou son coin bas-gauche.
 * Le panneau grandit donc quand on tire vers la gauche — l'inverse de la poignée native de
 * `resize: both`, posée en bas à droite, qui l'aurait fait grandir à l'opposé du geste.
 *
 * Un séparateur focusable (motif « window splitter ») : les flèches règlent la taille, Maj
 * l'accélère. `aria-valuenow` ne porte qu'une valeur — la largeur, commune aux deux poignées ;
 * `aria-valuetext` dit les deux dimensions du coin.
 */
export function CmvResizeHandle({
  axis,
  size,
  min,
  max,
  onResize,
  className,
}: Readonly<CmvResizeHandleProps>) {
  const { t } = useTranslation();
  // Le point et la taille au début du geste : chaque mouvement repart d'eux, et non du précédent —
  // sans quoi la poignée, bloquée à une borne, repartirait avant que le pointeur ne revienne.
  const drag = useRef<{ x: number; y: number; from: Size } | null>(null);

  function resize(next: Size) {
    onResize(clampSize(next, min, max));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? SHIFT_STEP : STEP;
    const grow: Record<string, Size> = {
      ArrowLeft: { width: step, height: 0 },
      ArrowRight: { width: -step, height: 0 },
      ...(axis === "xy"
        ? { ArrowDown: { width: 0, height: step }, ArrowUp: { width: 0, height: -step } }
        : {}),
    };
    const delta = grow[event.key];
    if (delta == null) return;
    event.preventDefault();
    resize({ width: size.width + delta.width, height: size.height + delta.height });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Pas de sélection de texte pendant le geste, et la poignée suit le pointeur hors d'elle-même.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: size };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (start == null) return;
    resize({
      width: start.from.width + start.x - event.clientX,
      height: axis === "xy" ? start.from.height + event.clientY - start.y : start.from.height,
    });
  }

  function onPointerEnd() {
    drag.current = null;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: un `<hr>` ne prend ni le focus ni les flèches — le séparateur réglable de l'ARIA est un élément générique
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t(axis === "x" ? "common.resize.width" : "common.resize.size")}
      aria-valuenow={size.width}
      aria-valuemin={min.width}
      aria-valuemax={Math.max(min.width, max.width)}
      aria-valuetext={
        axis === "x"
          ? t("common.resize.widthValue", { width: size.width })
          : t("common.resize.sizeValue", { width: size.width, height: size.height })
      }
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className={cn(
        "touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cmv-accent",
        AXIS_CLASSES[axis],
        className,
      )}
    >
      {/* Le coin se dessine en équerre ; le bord n'a que son survol. */}
      {axis === "xy" ? (
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-1 size-2 border-cmv-text-lo border-b-2 border-l-2"
        />
      ) : null}
    </div>
  );
}
