/**
 * Le pas d'une action d'accessibilité sur un curseur de lecture, en secondes (#536).
 *
 * Fixe et non proportionnel : « avance de 5 secondes » se prévoit, un dixième de note non — il vaut
 * une seconde sur un vocal court et vingt sur un long.
 */
export const SEEK_STEP_SECONDS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * La position, en secondes, d'un point de la barre situé à `x` de son bord gauche.
 *
 * Bornée à `[0, total]` : le doigt sort de la barre sans que la note sorte d'elle-même. `null` quand
 * il n'y a rien à viser — barre pas encore mesurée, ou durée inconnue —, jamais un 0 qui ferait
 * sauter la note au début.
 */
export function positionAt(x: number, width: number, total: number | null): number | null {
  if (total == null || total <= 0 || width <= 0) return null;
  return clamp((x / width) * total, 0, total);
}

/** Un pas en avant (`1`) ou en arrière (`-1`) depuis `position`, sans sortir de la note. */
export function nudge(position: number, direction: 1 | -1, total: number): number {
  return clamp(position + direction * SEEK_STEP_SECONDS, 0, total);
}
