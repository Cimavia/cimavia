/**
 * Part de la borne à partir de laquelle une zone de texte montre son compteur (#319).
 *
 * Toujours affiché, le compteur serait du bruit sur un débrief de trois lignes ; jamais affiché, la
 * saisie s'arrête net à la borne (`maxLength`) sans que rien ne dise pourquoi. À 90 %, il prévient
 * avant l'arrêt, et seulement ceux qui en approchent.
 */
export const CHAR_COUNT_THRESHOLD = 0.9;

/** La zone de texte approche-t-elle sa borne au point de devoir afficher « 4 620 / 5 000 » ? */
export function shouldShowCharCount(length: number, maxLength: number): boolean {
  return length >= maxLength * CHAR_COUNT_THRESHOLD;
}
