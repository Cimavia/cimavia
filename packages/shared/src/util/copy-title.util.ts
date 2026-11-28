/**
 * Le titre d'une copie : celui de la source suivi de son suffixe (« Bloc force (copie) ») — et qui
 * tient dans la borne du champ (#5).
 *
 * Accolé tel quel, un titre déjà proche de sa borne la dépasserait, et l'API refuserait la copie
 * en 400 pour un titre que le coach n'a pas écrit. C'est donc le titre qui se raccourcit, jamais le
 * suffixe : c'est lui qui dit, dans la liste, laquelle des deux est la copie.
 *
 * La borne se compte comme Zod la compte (`string.length`, en unités UTF-16), mais la coupe tombe
 * entre deux points de code : une paire de substitution n'est jamais coupée en deux moitiés
 * illisibles. Un emoji composé (ZWJ, drapeau, teinte) peut, lui, perdre la fin de sa séquence :
 * seul un découpage en graphèmes (`Intl.Segmenter`) l'éviterait, pour un titre qui touche déjà la
 * borne de 200.
 *
 * `null` si le suffixe seul ne tient pas dans la borne — il n'y a alors pas de titre de copie
 * lisible, et en inventer un serait un repli silencieux (règle 5).
 */
export function copyTitle(title: string, suffix: string, maxLength: number): string | null {
  if (suffix.length > maxLength) return null;
  const tail = ` ${suffix}`;
  // Négatif quand seul le suffixe tient : aucun caractère du titre ne passe.
  const budget = maxLength - tail.length;
  let head = "";
  for (const char of title) {
    if (head.length + char.length > budget) break;
    head += char;
  }
  // Une coupe qui tombe sur un espace en laisserait deux avant le suffixe ; plus de titre du tout,
  // il n'en laisserait qu'un, en tête.
  const kept = head.trimEnd();
  return kept === "" ? suffix : `${kept}${tail}`;
}
