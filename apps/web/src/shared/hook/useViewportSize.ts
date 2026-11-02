import { useSyncExternalStore } from "react";
import type { Size } from "@/shared/util/resize.util";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * Lu en deux instantanés et non en un objet : `useSyncExternalStore` compare par identité, et un
 * `{ width, height }` neuf à chaque lecture ferait boucler le rendu.
 */
const readWidth = () => window.innerWidth;
const readHeight = () => window.innerHeight;

/**
 * La taille de la fenêtre, suivie au redimensionnement (#695) — la borne haute d'un panneau
 * réglable. Une taille enregistrée sur un grand écran s'y ramène au rendu, et rien n'est réécrit :
 * revenu sur le grand écran, on retrouve celle qu'on avait choisie.
 */
export function useViewportSize(): Size {
  const width = useSyncExternalStore(subscribe, readWidth);
  const height = useSyncExternalStore(subscribe, readHeight);
  return { width, height };
}
