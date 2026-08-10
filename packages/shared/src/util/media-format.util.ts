// Conversions d'affichage des plafonds média, partagées API ↔ web ↔ mobile.
//
// Elles existent pour une raison précise : les messages de refus citaient les plafonds EN DUR
// (« Cette vidéo dépasse 50 Mo »). Le jour où les constantes ont bougé, six chaînes se sont mises à
// mentir à l'utilisateur sans qu'aucune porte ne le voie — ni le typecheck, ni `check:i18n`, qui
// vérifie l'existence des clés, pas la véracité de leur contenu. Interpoler depuis la constante
// supprime la classe entière.

const BYTES_PER_MEGABYTE = 1024 * 1024;
const SECONDS_PER_MINUTE = 60;

/**
 * Le plafond en Mo, arrondi — c'est un ordre de grandeur destiné à un humain, pas une valeur
 * opposable. La borne exacte, elle, est signée dans l'URL d'upload et vérifiée par le storage.
 */
export function megabytesOf(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MEGABYTE);
}

// Le plafond en minutes, arrondi. Même usage : dire « 5 minutes » plutôt que « 300 secondes ».
export function minutesOf(seconds: number): number {
  return Math.round(seconds / SECONDS_PER_MINUTE);
}
