import type { TFunction } from "i18next";

/**
 * « 3 blocs · 7 exercices » : ce que la carte d'une séance dit de sa composition, dans le
 * constructeur, la bibliothèque et la grille du Plan. Une séance de l'ancien modèle n'a aucun
 * bloc : elle ne dit que ses exercices, plutôt qu'un « 0 bloc » qui la ferait croire vide.
 */
export function compositionSummary(
  counts: { blockCount: number; exerciseCount: number },
  t: TFunction,
): string {
  const exercises = t("common.composition.exercises", { count: counts.exerciseCount });
  if (counts.blockCount === 0) return exercises;
  return [t("common.composition.blocks", { count: counts.blockCount }), exercises].join(" · ");
}
