/**
 * Qui a le droit de créer un compte (#263).
 *
 * Preview porte de vraies données et son URL n'est pas secrète — elle est figée dans l'APK et dans
 * chaque e-mail envoyé. La fermer demande donc que l'API refuse, pas qu'on cache l'adresse.
 *
 * Tout ce qui se décide SANS la base vit ici : normaliser une adresse, lire la liste de
 * l'environnement, dire si une adresse y figure. La seule question qui reste au service est
 * « existe-t-il une invitation nominative en cours pour cette adresse ? ».
 */

/** Les deux modes. `open` pour la production, `invitation` pour preview. */
export const SIGNUP_MODES = ["open", "invitation"] as const;

export type SignupMode = (typeof SIGNUP_MODES)[number];

/**
 * L'adresse sous la forme qui sert à COMPARER — jamais à afficher.
 *
 * Deux chaînes tapées par deux personnes différentes se rencontrent ici : le coach saisit
 * l'adresse de son athlète, l'athlète a saisi la sienne à l'inscription. Rien ne garantit la même
 * casse ni l'absence d'espace collé au copier-coller, et une comparaison brute rendait alors une
 * invitation **définitivement inutilisable** — refusée à l'acceptation, invisible dans la liste,
 * sans qu'aucun message ne dise pourquoi. C'est le contraire de ce que l'invitation nominative
 * promet.
 *
 * Normalisée à l'écriture ET à la comparaison : la première seule ne rattraperait pas les lignes
 * déjà en base, la seconde seule laisserait la colonne porter deux formes du même destinataire.
 *
 * Née privée à `InvitationService`, elle monte ici parce que la porte d'inscription (#263) pose
 * exactement la même question — et deux copies d'une règle de comparaison finissent par diverger.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * La liste d'adresses autorisées de l'environnement, séparées par des virgules.
 *
 * Elle existe pour les **Coachs**, que personne n'invite : sans elle, un environnement fermé
 * n'accueillerait plus jamais le premier compte. Les entrées vides sont ignorées — une liste
 * `"a@x.fr,,b@x.fr"` ou terminée par une virgule est une faute de frappe, pas une autorisation
 * pour l'adresse vide.
 */
export function parseEmailList(raw: string | undefined | null): string[] {
  if (raw == null) return [];

  return raw
    .split(",")
    .map(normalizeEmail)
    .filter((email) => email.length > 0);
}

/**
 * Cette adresse figure-t-elle dans la liste ?
 *
 * La comparaison passe des deux côtés par `normalizeEmail` : la liste est tapée à la main dans un
 * `.env`, où une majuscule ou une espace s'invite sans qu'on la voie.
 */
export function isEmailAllowed(email: string, allowed: readonly string[]): boolean {
  const normalized = normalizeEmail(email);

  return allowed.some((candidate) => normalizeEmail(candidate) === normalized);
}
