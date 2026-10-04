/**
 * Deux valeurs partiraient-elles sur le fil sous le MÊME JSON ?
 *
 * Comparé sur une forme CANONIQUE (clés triées) : deux objets identiques écrits dans un ordre
 * différent — au fil des saisies d'un côté, au chargement de l'autre — ne doivent pas passer pour
 * une modification. Une clé à `undefined` compte comme absente, parce que `JSON.stringify` la
 * tait : `{ id: undefined }` et `{}` envoient la même chose.
 *
 * Sert à dire si un écran montre autre chose que l'enregistré — un suivi d'exécution (#168), un
 * constructeur de bibliothèque (#327).
 */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value != null && typeof value === "object") {
    const fields = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      // La clé passe par `JSON.stringify` : écrite nue, `{"a:1": …}` et `{a: "1…"}` pouvaient
      // produire la même chaîne.
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value);
}
