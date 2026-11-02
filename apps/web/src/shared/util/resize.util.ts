export type Size = { width: number; height: number };

/**
 * Ramène `value` entre `min` et `max`. Le MINIMUM l'emporte quand la fenêtre est trop petite pour
 * les deux (`max < min`) : un panneau rogné sous sa taille d'origine ne se lirait plus — il déborde
 * alors, comme avant d'être réglable.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** `clamp` sur les deux dimensions. */
export function clampSize(size: Size, min: Size, max: Size): Size {
  return {
    width: clamp(size.width, min.width, max.width),
    height: clamp(size.height, min.height, max.height),
  };
}
