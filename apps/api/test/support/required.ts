/**
 * Sous `noUncheckedIndexedAccess`, `list[0]` et `.find()` rendent `T | undefined`. La correction
 * réflexe — `list[0]?.id` — est un piège : une liste vide produirait alors une requête sur
 * `/undefined` dont le 404 ferait PASSER un test d'isolation qui ne teste plus rien. On échoue
 * donc ici, à l'endroit exact où la donnée manque, avec le nom de ce qu'on attendait.
 */
export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Donnée de test absente : ${what}`);
  return value;
}
