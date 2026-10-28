import { type RefObject, useCallback, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";

/** Ce que l'écran donne de son défilement : la position, la fenêtre, et la hauteur du contenu. */
type ScrollMetrics = Pick<NativeScrollEvent, "contentOffset" | "layoutMeasurement" | "contentSize">;

// Le bas du contenu, à un demi-point près : le défilement s'y arrête rarement au pixel.
const END_SLACK = 1;

/**
 * Le bloc « en cours » d'après le défilement : le dernier dont le haut est passé sous le haut de
 * l'écran, le premier au départ. Arrivé au bas du contenu, c'est le DERNIER — les blocs courts de
 * fin ne remontent jamais jusqu'en haut, leur puce ne ressortirait pas.
 */
export function currentBlockOf(tops: readonly number[], metrics: ScrollMetrics): number {
  const { contentOffset, layoutMeasurement, contentSize } = metrics;
  const atEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLACK;
  if (atEnd && tops.length > 0) return tops.length - 1;
  let current = 0;
  tops.forEach((top, index) => {
    if (top <= contentOffset.y) current = index;
  });
  return current;
}

/**
 * Suit le défilement de l'écran pour la liste des blocs (#722) : quelle puce ressort, et où mène
 * chacune.
 *
 * L'écran ne se re-rend que quand le bloc en cours CHANGE, pas à chaque événement de défilement :
 * re-rendre toutes les cartes quinze fois par seconde pour déplacer une puce saccadait le défilement.
 *
 * Une puce touchée reste en cours tant que l'athlète ne fait pas défiler lui-même : le défilement
 * qu'elle lance s'arrête au bas du contenu pour un bloc de fin, et la position y désignerait un
 * autre bloc.
 */
export function useBlockScrollSpy(scroll: RefObject<ScrollView | null>, count: number) {
  const [current, setCurrent] = useState(0);
  // Les hauteurs se mesurent au rendu : la liste dans l'écran, chaque bloc dans la liste.
  const listTop = useRef(0);
  const tops = useRef<number[]>([]);
  const pinned = useRef(false);
  // Les hauteurs de blocs retirés depuis restent dans `tops` : seules comptent celles affichées.
  const shown = useRef(count);
  shown.current = count;

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pinned.current) return;
    const blockTops = tops.current.slice(0, shown.current).map((top) => listTop.current + top);
    // Même valeur : React ne re-rend pas.
    setCurrent(currentBlockOf(blockTops, event.nativeEvent));
  }, []);

  /** L'athlète reprend la main : la position redevient juge. */
  const release = useCallback(() => {
    pinned.current = false;
  }, []);

  const scrollTo = useCallback(
    (index: number) => {
      pinned.current = true;
      setCurrent(index);
      scroll.current?.scrollTo({ y: listTop.current + (tops.current[index] ?? 0), animated: true });
    },
    [scroll],
  );

  const measureList = useCallback((y: number) => {
    listTop.current = y;
  }, []);

  const measureBlock = useCallback((index: number, y: number) => {
    tops.current[index] = y;
  }, []);

  return { current, onScroll, release, scrollTo, measureList, measureBlock };
}

export type BlockScrollSpy = ReturnType<typeof useBlockScrollSpy>;
