import { type RefCallback, useCallback, useRef, useState } from "react";

/**
 * En deçà de cette distance au bas, le lecteur « est au bas » : un bouton de lecteur ou une marge
 * qui dépasse ne le décroche pas, mais une bulle remontée, si.
 */
export const NEAR_BOTTOM_PX = 80;

type ScrollMetrics = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">;

export function isNearBottom({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): boolean {
  return scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_PX;
}

/** Observe une taille ; sans `ResizeObserver` (jsdom), rien ne suit et rien ne casse. */
function observeSize(node: Element, onResize: () => void): (() => void) | undefined {
  if (typeof ResizeObserver === "undefined") return undefined;
  const observer = new ResizeObserver(onResize);
  observer.observe(node);
  return () => observer.disconnect();
}

export type StickToBottom = {
  /** Le conteneur qui défile. */
  scrollRef: RefCallback<HTMLElement>;
  /** Ce qu'il fait défiler : c'est sa croissance — un média chargé, un message — qu'on suit. */
  contentRef: RefCallback<HTMLElement>;
  /** Le fil suit le bas : le lecteur y est, à `NEAR_BOTTOM_PX` près, ou y est renvoyé. */
  atBottom: boolean;
  /** Ramène au bas sur-le-champ, et y recolle. */
  stickToBottom: () => void;
  /** Ramène au bas en douceur, et y recolle : le geste du lecteur, pas celui du fil. */
  scrollToBottom: () => void;
};

/**
 * Un fil qui reste collé au bas TANT QUE le lecteur y est (#367).
 *
 * Le fil ne recolle pas à l'arrivée d'un message, mais quand son contenu ou son cadre change de
 * taille : une photo chargée après coup, une vidéo qui lit ses métadonnées, une barre d'envoi qui
 * s'agrandit, un message ajouté. Un `scrollIntoView` au rendu tombait avant le chargement des
 * images, et laissait la dernière photo coupée à mi-hauteur.
 *
 * Le lecteur qui REMONTE se décroche, et plus rien ne le ramène d'office : c'est l'appelant qui
 * décide, par `stickToBottom`, de ce qui mérite de l'y ramener. Remonter, et pas « être loin du
 * bas » : entre l'écriture de `scrollTop` et l'événement `scroll` qu'elle provoque, une photo peut
 * finir de charger — l'écart lu dépasse alors le seuil sans que le lecteur ait bougé, et le fil se
 * décrocherait tout seul, la dernière photo coupée.
 */
export function useStickToBottom(): StickToBottom {
  const container = useRef<HTMLElement | null>(null);
  // Une ref ET un état : la ref est lue par les observateurs sans attendre un rendu, l'état fait
  // rendre ce qui en dépend.
  const stuck = useRef(true);
  // Le dernier `scrollTop` connu : ce qui dit qu'un défilement remonte.
  const lastTop = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  const stick = useCallback((value: boolean) => {
    stuck.current = value;
    setAtBottom(value);
  }, []);

  const stickToBottom = useCallback(() => {
    stick(true);
    const node = container.current;
    if (node == null) return;
    node.scrollTop = node.scrollHeight;
    lastTop.current = node.scrollTop;
  }, [stick]);

  const follow = useCallback(() => {
    if (stuck.current) stickToBottom();
  }, [stickToBottom]);

  const scrollRef = useCallback<RefCallback<HTMLElement>>(
    (node) => {
      container.current = node;
      if (node == null) return undefined;
      // Un cadre neuf — le fil revenu d'une erreur — repart collé : il s'ouvre en haut, et la
      // position d'avant n'a pas survécu à son démontage.
      stick(true);
      lastTop.current = node.scrollTop;
      const onScroll = () => {
        if (isNearBottom(node)) stick(true);
        else if (node.scrollTop < lastTop.current) stick(false);
        lastTop.current = node.scrollTop;
      };
      node.addEventListener("scroll", onScroll, { passive: true });
      const unobserve = observeSize(node, follow);
      return () => {
        node.removeEventListener("scroll", onScroll);
        unobserve?.();
        container.current = null;
      };
    },
    [follow, stick],
  );

  const contentRef = useCallback<RefCallback<HTMLElement>>(
    (node) => (node == null ? undefined : observeSize(node, follow)),
    [follow],
  );

  // Recollé dès le geste : une photo qui charge pendant la descente ne la laisse pas à court.
  const scrollToBottom = useCallback(() => {
    stick(true);
    const node = container.current;
    node?.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [stick]);

  return { scrollRef, contentRef, atBottom, stickToBottom, scrollToBottom };
}
