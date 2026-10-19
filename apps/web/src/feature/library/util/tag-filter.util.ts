const byName = (a: string, b: string) => a.localeCompare(b);

/**
 * Les pastilles du filtre par tags : les tags connus, et ceux qu'on a choisis même s'ils n'y sont
 * plus. Une relecture peut en faire sortir un — le dernier exercice qui le portait vient d'être
 * supprimé — alors que le filtre l'applique encore : sans sa pastille, il ne se décocherait plus.
 */
export function tagFilterOptions(known: readonly string[], chosen: readonly string[]): string[] {
  return [...new Set([...known, ...chosen])].sort(byName);
}

/**
 * Le choix après un clic sur un tag : ajouté s'il n'y était pas, retiré sinon. Trié, pour que le
 * même ensemble soit toujours la même requête — et la même entrée de cache.
 */
export function toggledTags(chosen: readonly string[], tag: string): string[] {
  const next = chosen.includes(tag) ? chosen.filter((name) => name !== tag) : [...chosen, tag];
  return next.sort(byName);
}
