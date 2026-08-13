/**
 * Les initiales d'un nom affiché — « Léa Moreau » → « LM », « Jean-Paul Sartre » → « JS ».
 *
 * Repli d'une pastille d'avatar quand la personne n'a pas d'image. La chaîne vide en sortie n'est
 * PAS un manquement à la règle nullable : un nom vide n'a pas d'initiales, et la pastille rend
 * alors un rond neutre — il n'y a rien à deviner.
 *
 * PREMIER mot + DERNIER mot, et non les deux premiers : « Marie Anne Claire Dupont » doit rendre
 * « MD », pas « MA » — on cherche le prénom et le nom de famille, pas les deux premières syllabes
 * de l'état civil.
 *
 * Découpe sur les espaces SEULS : un prénom composé reste un mot, sinon « Jean-Paul Sartre »
 * rendrait « JP » et perdrait le nom de famille. Les accents sont conservés (« Élodie » → « É ») :
 * c'est un affichage, pas une clé de tri.
 */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return "";

  const first = words.at(0) ?? "";
  const last = words.at(-1) ?? "";
  const initials = words.length === 1 ? first.charAt(0) : first.charAt(0) + last.charAt(0);
  return initials.toLocaleUpperCase();
}

/**
 * La forme COMPARABLE d'un nom : sans casse, sans accent, sans espaces de bord.
 *
 * Un coach tape « lea » pour trouver « Léa ». Exiger l'accent ferait échouer la recherche sur
 * exactement les noms que le clavier rend pénibles à écrire — et « MOREAU » doit trouver
 * « Moreau ». C'est une clé de COMPARAISON, jamais un affichage : `initialsOf`, lui, garde ses
 * accents, et les deux ne doivent pas être confondues.
 *
 * NFD sépare la lettre de son signe diacritique, le bloc U+0300–U+036F retire les signes. Pas de
 * `\p{Diacritic}` : ce fichier est aussi compilé dans le bundle mobile, et un échappement de
 * propriété Unicode se paierait au parsing du module, pas à l'appel.
 */
export function comparableName(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}
