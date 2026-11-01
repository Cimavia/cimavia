import type { TFunction } from "i18next";

/**
 * « 3 blocs · 7 exercices » : ce que la carte d'une séance dit de sa composition, dans le
 * constructeur, la bibliothèque et la grille du Plan. Une séance vide ne dit que « 0 exercice »,
 * plutôt que « 0 bloc · 0 exercice » qui répète la même absence.
 */
export function compositionSummary(
  counts: { blockCount: number; exerciseCount: number },
  t: TFunction,
): string {
  const exercises = t("common.composition.exercises", { count: counts.exerciseCount });
  if (counts.blockCount === 0) return exercises;
  return [t("common.composition.blocks", { count: counts.blockCount }), exercises].join(" · ");
}
