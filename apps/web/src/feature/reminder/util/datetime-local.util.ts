/**
 * Pont entre l'`<input type="datetime-local">` et l'instant ISO du DTO.
 *
 * Le champ natif parle en heure LOCALE et sans fuseau (« 2026-08-15T09:00 ») ; `Reminder.dueAt` est
 * un instant en UTC. Les deux conversions vivent ici plutôt que dans le composant : c'est
 * exactement le genre de va-et-vient qu'on écrit de travers une fois sur deux.
 *
 * ⚠️ `toISOString()` ne peut PAS servir à remplir le champ : il rend de l'UTC, donc « 09:00 » à
 * Paris s'y afficherait « 07:00 ». D'où la construction à partir des composantes locales.
 */

const pad = (value: number) => String(value).padStart(2, "0");

// Date → « YYYY-MM-DDTHH:mm » en heure locale, la seule forme que le champ natif accepte.
export function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * « YYYY-MM-DDTHH:mm » (heure locale) → instant ISO UTC, ou `null` si la valeur est vide ou
 * illisible — un champ non rempli n'est pas une date, et le formulaire refuse alors d'envoyer.
 *
 * `new Date("2026-08-15T09:00")` est bien interprété en heure LOCALE (forme sans fuseau, per spec) :
 * c'est ce qui rend la conversion correcte sans calcul de décalage à la main.
 */
export function fromDatetimeLocalValue(value: string): string | null {
  if (value === "") return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
