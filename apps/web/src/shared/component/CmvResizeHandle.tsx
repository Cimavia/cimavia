import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/util/cn.util";
import { clampSize, type Size } from "@/shared/util/resize.util";

// Un pas de flèche, et un pas avec Maj — de 320 à 1000 px en une dizaine d'appuis.
const STEP = 16;
const SHIFT_STEP = STEP * 4;
// Un bord n'a qu'une dimension : la poignée calcule sur une taille, sa hauteur reste à zéro.
const FLAT = 0;

/**
 * `onResize` suit le glisser, `onResizeEnd` conclut un geste qui a changé quelque chose : au
 * relâchement d'un pointeur qui a bougé, et à chaque flèche. C'est le second qu'un appelant retient — garder la taille à chaque mouvement re-rendrait
 * et réécrirait tout ce qui en dépend, une centaine de fois par seconde.
 */
type EdgeProps = {
  /** Un bord : la largeur seule. */
  axis: "x";
  size: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
};

type CornerProps = {
  /** Un coin : la largeur et la hauteur. */
  axis: "xy";
  size: Size;
  min: Size;
  max: Size;
  onResize: (size: Size) => void;
  onResizeEnd: (size: Size) => void;
};

type CmvResizeHandleProps = (EdgeProps | CornerProps) & {
  /** La place de la poignée sur son panneau (`absolute …`). */
  className?: string;
};

const AXIS_CLASSES: Record<CmvResizeHandleProps["axis"], string> = {
  x: "w-2 cursor-ew-resize hover:bg-cmv-border-hi",
  xy: "size-4 cursor-nesw-resize",
};

type Box = {
  size: Size;
  min: Size;
  max: Size;
  emit: (size: Size, end: boolean) => void;
};

// Les deux formes ramenées à une seule, pour que le geste ne s'écrive qu'une fois.
function toBox(props: EdgeProps | CornerProps): Box {
  if (props.axis === "xy") {
    return {
      size: props.size,
      min: props.min,
      max: props.max,
      emit: (size, end) => (end ? props.onResizeEnd(size) : props.onResize(size)),
    };
  }
  return {
    size: { width: props.size, height: FLAT },
    min: { width: props.min, height: FLAT },
    max: { width: props.max, height: FLAT },
    emit: (size, end) => (end ? props.onResizeEnd(size.width) : props.onResize(size.width)),
  };
}

/**
 * La poignée d'un panneau ANCRÉ À DROITE (#695) : elle tient son bord gauche, ou son coin bas-gauche.
 * Le panneau grandit donc quand on tire vers la gauche — l'inverse de la poignée native de
 * `resize: both`, posée en bas à droite, qui l'aurait fait grandir à l'opposé du geste.
 *
 * Un séparateur focusable (motif « window splitter ») : les flèches règlent la taille, Maj
 * l'accélère. `aria-valuenow` ne porte qu'une valeur — la largeur, commune aux deux poignées ;
 * `aria-valuetext` dit les deux dimensions du coin.
 */
export function CmvResizeHandle(props: Readonly<CmvResizeHandleProps>) {
  const { axis, className } = props;
  const { t } = useTranslation();
  const { size, min, max, emit } = toBox(props);
  /**
   * Le point et la taille au début du geste : chaque mouvement repart d'eux, et non du précédent —
   * sans quoi la poignée, bloquée à une borne, repartirait avant que le pointeur ne revienne.
   * `last` est ce que le relâchement retiendra — s'il existe : un simple clic n'a rien choisi, et
   * enregistrer la taille d'origine figerait un panneau qui suivait son contenu.
   */
  const drag = useRef<{ x: number; y: number; from: Size; last: Size | null } | null>(null);

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
    const next = clampSize(
      { width: size.width + delta.width, height: size.height + delta.height },
      min,
      max,
    );
    // Une flèche est un geste entier : conclu d'emblée, sans brouillon à suivre.
    emit(next, true);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Pas de sélection de texte pendant le geste, et la poignée suit le pointeur hors d'elle-même.
    // Appel optionnel : jsdom n'implémente pas la capture, les tests s'en passent.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: size, last: null };
  }

  function end() {
    const gesture = drag.current;
    if (gesture == null) return;
    drag.current = null;
    if (gesture.last != null) emit(gesture.last, true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (gesture == null) return;
    // Bouton relâché sans qu'on l'ait vu (capture perdue, relâché hors de la fenêtre) : le geste
    // est fini — sinon un simple survol continuerait de redimensionner.
    if ((event.buttons & 1) === 0) {
      end();
      return;
    }
    gesture.last = clampSize(
      {
        width: gesture.from.width + gesture.x - event.clientX,
        height: axis === "xy" ? gesture.from.height + event.clientY - gesture.y : FLAT,
      },
      min,
      max,
    );
    emit(gesture.last, false);
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
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
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
