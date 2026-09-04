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
