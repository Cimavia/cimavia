// Durées d'entraînement : saisie tolérante côté coach, rendu canonique partout.
//
// Distinct de `formatMmSs` (media-format.util), qui rend « m:ss » pour le compteur d'un lecteur.
// Ici la durée est une CONSIGNE écrite à la main — « 30 s » de gainage, « 2'30 » de repos — et
// s'écrit comme un coach l'écrit : la minute avec une apostrophe, la seconde suffixée.
//
// Ces deux fonctions vivent dans `@cmv/shared` parce que trois surfaces en dépendent — la grille
// du constructeur, le rendu athlète mobile et le rendu web. Trois implémentations divergeraient
// sur le premier cas limite venu (« 2m30 » accepté ici, refusé là).

const SECONDS_PER_MINUTE = 60;
export const TRAINING_DURATION_MAX_SECONDS = 24 * 60 * 60;

// « 150 » · « 2:30 » · « 2m30 » · « 2'30 » · « 2min30 » · « 30s » · « 3' ».
//
// Les secondes et leur espace de fin sont dans le MÊME groupe optionnel : écrits séparément
// (`\s*(\d{1,4})?\s*`), deux quantificateurs se disputaient la même suite d'espaces, ce qui
// donne autant de découpages à essayer que d'espaces — du retour arrière pour rien.
const MINUTES_SECONDS = /^(\d{1,4})\s*(?::|'|min|m)\s*(?:(\d{1,4})\s*)?s?$/i;
const SECONDS_ONLY = /^(\d{1,5})\s*s$/i;
const BARE_NUMBER = /^\d{1,5}$/;

/**
 * Une saisie libre → des secondes, ou `null` si elle n'est pas interprétable.
 *
 * Un nombre nu compte des SECONDES : « 150 » vaut 2'30, jamais 150 minutes. C'est ce que fait le
 * coach qui tape vite, et l'affichage canonique le lui confirme aussitôt.
 */
export function parseTrainingDuration(input: string | null | undefined): number | null {
  const value = input?.trim();
  if (!value) return null;

  const bounded = (seconds: number): number | null =>
    Number.isFinite(seconds) && seconds >= 0 && seconds <= TRAINING_DURATION_MAX_SECONDS
      ? seconds
      : null;

  const minutesSeconds = MINUTES_SECONDS.exec(value);
  if (minutesSeconds) {
    const minutes = Number(minutesSeconds[1]);
    const seconds = minutesSeconds[2] ? Number(minutesSeconds[2]) : 0;
    // « 2:75 » vaut 3'15 : les secondes au-delà de 59 débordent sur les minutes plutôt que d'être
    // refusées. Le rendu canonique montre aussitôt ce qui a été compris, ce qui rattrape la faute
    // de frappe mieux qu'un refus muet.
    return bounded(minutes * SECONDS_PER_MINUTE + seconds);
  }

  const secondsOnly = SECONDS_ONLY.exec(value);
  if (secondsOnly) return bounded(Number(secondsOnly[1]));

  if (BARE_NUMBER.test(value)) return bounded(Number(value));

  return null;
}

/**
 * Des secondes → l'écriture d'un coach. Trois formes selon la grandeur :
 * « 45 s » sous la minute, « 3' » sur une minute pleine, « 2'30 » sinon.
 *
 * `null` en entrée → `null` en sortie (règle dure n°5) : au rendu d'afficher « — ». Surtout pas
 * « 0 s », qui ferait passer une durée ABSENTE pour une durée nulle.
 */
export function formatTrainingDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / SECONDS_PER_MINUTE);
  const rest = total % SECONDS_PER_MINUTE;

  if (minutes === 0) return `${rest} s`;
  if (rest === 0) return `${minutes}'`;
  return `${minutes}'${String(rest).padStart(2, "0")}`;
}
