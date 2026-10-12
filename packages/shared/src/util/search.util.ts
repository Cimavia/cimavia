/**
 * La forme COMPARABLE d'un texte cherché : sans casse, sans accent, sans espaces de bord.
 *
 * Règle unique de toutes les recherches côté client — noms d'athlètes comme titres d'exercices.
 * Un coach tape « lea » pour trouver « Léa », « echauffement » pour trouver « Échauffement » :
 * exiger l'accent ferait échouer la recherche sur exactement les mots que le clavier rend pénibles
 * à écrire, et personne ne comprend pourquoi sa liste est vide.
 *
 * Clé de COMPARAISON, jamais un affichage : `initialsOf` garde ses accents (« Élodie » → « É »),
 * et les deux ne doivent pas être confondues. À appliquer des DEUX côtés — au terme cherché comme
 * à la valeur inspectée — sans quoi la symétrie est perdue.
 *
 * NFD sépare la lettre de son signe diacritique, le bloc U+0300–U+036F retire les signes. Pas
 * d'échappement de propriété Unicode (`\p{Diacritic}`) : ce fichier est aussi compilé dans le
 * bundle mobile, où il se paierait au parsing du module et non à l'appel.
 */
export function comparableText(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

/**
 * Le test d'une recherche, prêt à appliquer à chaque valeur : le terme est rendu comparable UNE
 * fois, la valeur à chaque appel — les deux côtés de la même règle, sans qu'un appelant puisse en
 * oublier un.
 *
 * Sous-chaîne et non préfixe : un coach tape aussi bien le nom de famille que le prénom. Un terme
 * vide garde tout, sans cas particulier : la chaîne vide est contenue dans toutes les autres.
 */
export function searchMatcher(search: string): (value: string) => boolean {
  const needle = comparableText(search);
  return (value) => comparableText(value).includes(needle);
}
