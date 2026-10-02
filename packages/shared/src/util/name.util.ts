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
  const [first, ...rest] = name.split(/\s+/).filter((word) => word.length > 0);
  if (first == null) return "";

  // Un mot seul n'a qu'une initiale : le « dernier » mot serait le premier.
  const last = rest.at(-1);
  const initials = last == null ? first.charAt(0) : first.charAt(0) + last.charAt(0);
  return initials.toLocaleUpperCase();
}
