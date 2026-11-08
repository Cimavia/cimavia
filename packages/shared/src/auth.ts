// Contraintes d'authentification partagées client (formulaires) ↔ serveur (Better Auth).
// Source unique : éviter que les règles divergent entre l'UI et l'API.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Durée de validité du lien de réinitialisation de mot de passe.
 *
 * Elle vaut le défaut de Better Auth, et c'est justement pourquoi elle est écrite : c'est cette
 * même durée que l'e-mail ANNONCE (« ce lien est valable une heure »). Laissée implicite, une mise
 * à jour de la bibliothèque changerait la durée réelle sans toucher au texte — le message
 * mentirait, et aucun test ne le verrait. Les heures sont la source, les secondes en dérivent :
 * l'un configure Better Auth, l'autre s'écrit dans le message.
 */
export const RESET_PASSWORD_TOKEN_TTL_HOURS = 1;
const SECONDS_PER_HOUR = 3600;
export const RESET_PASSWORD_TOKEN_TTL_SECONDS = RESET_PASSWORD_TOKEN_TTL_HOURS * SECONDS_PER_HOUR;

/**
 * Durée de validité du lien de vérification d'adresse (#270).
 *
 * Une journée et non l'heure par défaut de Better Auth : ce lien se lit souvent plus tard que celui
 * d'une réinitialisation, qu'on demande au moment même où l'on veut se connecter. Un Athlete inscrit
 * sur le téléphone que lui tend son coach ouvrira sa boîte le soir. Écrite pour la même raison que
 * la précédente : c'est la durée que l'e-mail annonce.
 */
export const EMAIL_VERIFICATION_TOKEN_TTL_HOURS = 24;
export const EMAIL_VERIFICATION_TOKEN_TTL_SECONDS =
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS * SECONDS_PER_HOUR;

/**
 * Le `?error=` que l'API pose sur la page de retour du lien de vérification quand le compte n'a
 * plus de mot de passe (#270) : une seconde inscription sur l'adresse l'a effacé. L'adresse n'est
 * pas confirmée par ce lien — « mot de passe oublié » le fera. Partagé : l'API l'écrit, le web le
 * lit, et un renommage d'un seul côté ferait retomber l'écran sur « lien invalide ».
 */
export const VERIFY_EMAIL_PASSWORD_REQUIRED = "PASSWORD_REQUIRED";
