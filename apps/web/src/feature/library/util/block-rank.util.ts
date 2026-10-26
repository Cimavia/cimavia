/**
 * Un rang de bloc lu dans l'url (#719) : un entier positif ou nul. TanStack lit `?block=2` en
 * nombre ; une chaîne, un décimal ou un négatif ne désignent aucun bloc.
 */
export function isBlockRank(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
