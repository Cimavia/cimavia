import { type RefCallback, useCallback, useLayoutEffect, useRef } from "react";

/**
 * Appelle `onEnter` quand l'élément entre à l'écran — visible dans sa zone de défilement, que
 * l'`IntersectionObserver` sait découper. Sans lui (jsdom), rien ne se déclenche, et rien ne casse.
 *
 * Au RAPPEL de l'observateur, et non sur un état relu par un effet : l'effet tourne dans le rendu
 * même qui vient de déplacer l'élément, et y lirait la visibilité d'avant. L'observateur, lui,
 * mesure après la mise en page.
 *
 * `rearm` change → l'élément est observé à neuf, et l'observateur redit d'emblée s'il est à
 * l'écran. C'est ce qui laisse un élément RESTÉ à l'écran redéclencher, lui qui ne se manifeste
 * qu'aux changements : le repère qu'une page trop courte n'a pas repoussé.
 */
export function useWhenInView(onEnter: () => void, rearm: unknown): RefCallback<Element> {
  const latest = useRef(onEnter);
  useLayoutEffect(() => {
    latest.current = onEnter;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rearm` est un déclencheur, pas une donnée lue — changer d'identité fait détacher puis rattacher le ref, donc observer à neuf.
  return useCallback<RefCallback<Element>>(
    (node) => {
      if (node == null || typeof IntersectionObserver === "undefined") return undefined;
      const observer = new IntersectionObserver((entries) => {
        if (entries.at(-1)?.isIntersecting === true) latest.current();
      });
      observer.observe(node);
      return () => observer.disconnect();
    },
    [rearm],
  );
}
