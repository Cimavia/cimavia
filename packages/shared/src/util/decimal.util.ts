// Nombres décimaux saisis à la main : la charge d'un lest, un RPE, une distance, un pas de
// progression.
//
// Ils vivent ici parce que la saisie et le rendu doivent s'accorder sur toutes les surfaces : un
// coach qui tape « 12,5 » dans la grille web doit lire « 12,5 » dans l'aperçu, et l'athlète
// « 12,5 kg » sur mobile. `String(12.5)` écrit « 12.5 », quelle que soit la langue.

// « 12 » · « 12,5 » · « 12.5 » · « ,5 » · « 12, » · « -2,5 ».
//
// Une expression STRICTE plutôt que `Number()`, qui accepte « 1e3 », « 0x10 », « Infinity » et
// « » (zéro) : autant de saisies qu'un coach ne tape pas exprès, et qui deviendraient une
// consigne sans que rien ne le signale.
const DECIMAL_INPUT = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * Une saisie libre → un nombre, ou `null` si elle n'en est pas un.
 *
 * La virgule et le point valent tous deux séparateur décimal : le clavier français sort l'un, le
 * pavé numérique l'autre, et refuser l'un des deux ferait échouer la moitié des saisies. Il n'y a
 * donc pas de séparateur de milliers — « 1.500 » vaut 1,5, jamais 1500.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  const value = input?.trim();
  if (!value || !DECIMAL_INPUT.test(value)) return null;
  return Number(value.replace(",", "."));
}

/**
 * Un nombre → son écriture dans la langue du lecteur : « 12,5 » en français, « 12.5 » en anglais.
 *
 * Sans séparateur de milliers : « 1500 » m se relit dans une cellule et se ressaisit tel quel,
 * alors que « 1 500 » ne repasserait pas `parseDecimal`. `maximumFractionDigits: 20` rend le
 * nombre EXACT au lieu de l'arrondir à trois décimales, le défaut d'`Intl` : l'écran montre ce
 * qui est enregistré, pas une approximation.
 */
export function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 20,
  }).format(value);
}

/**
 * Le nombre de décimales d'un nombre tel qu'il s'écrit — 2 pour 12,25, 0 pour 12. `null` quand
 * l'écriture est exponentielle (« 1e-7 ») : on ne sait pas la compter sans risquer de l'arrondir
 * à zéro.
 */
export function decimalPlaces(value: number): number | null {
  const written = String(value);
  if (written.includes("e")) return null;
  return written.split(".")[1]?.length ?? 0;
}
