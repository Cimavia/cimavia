/**
 * Qui a le droit de créer un compte (#263).
 *
 * Preview porte de vraies données — les comptes, les planifications et les médias du Coach bêta et
 * de ses Athletes — et son URL n'a rien de secret : elle est figée dans l'APK installé sur les
 * téléphones et dans chaque e-mail qu'il envoie. La fermer demande donc que l'API refuse, pas
 * qu'on taise l'URL.
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

/**
 * La clé i18n qui dit POURQUOI une inscription est refusée, d'après le code HTTP.
 *
 * Partagée entre le web et le mobile — ils la déclaraient à l'identique, et c'est exactement le
 * genre de table qui diverge : le jour où l'API distingue un code de plus, une seule des deux
 * apps l'apprendrait.
 *
 * - **403** : l'environnement n'accepte pas d'inscription (#263). La saisie n'y est pour rien, et
 *   faire recommencer un formulaire juste serait la pire réponse possible.
 * - le reste, y compris une panne réseau qui ne porte aucun code : le message générique.
 *
 * Plus de 422 depuis #270 : avec la vérification d'adresse, une adresse déjà inscrite reçoit la
 * même réponse qu'une adresse neuve — c'est ce qui empêche de deviner qui a un compte — et c'est
 * son propriétaire qui l'apprend, par e-mail. Le formulaire n'a plus rien à en dire.
 */
export function signUpErrorKey(status: number | undefined): string {
  if (status === 403) return "auth.errors.signupClosed";
  return "auth.errors.generic";
}

/**
 * La clé i18n qui dit pourquoi une connexion est refusée, d'après l'erreur que rend le client Better
 * Auth. Partagée pour la même raison que `signUpErrorKey`.
 *
 * - **`EMAIL_NOT_VERIFIED`** : l'adresse n'est pas encore vérifiée (#270). Le mot de passe était le
 *   bon, et l'API vient de renvoyer le lien : « identifiants incorrects » ferait chercher l'erreur
 *   au mauvais endroit. Le CODE et non le seul 403 : Better Auth rend aussi 403 sur une origine
 *   refusée, où aucun lien n'est parti — l'annoncer ferait attendre un e-mail qui ne viendra pas.
 * - **401** : adresse ou mot de passe faux — Better Auth ne dit pas lequel, et le message non plus.
 * - **400** : la saisie que Better Auth refuse avant de chercher le compte — une adresse mal formée
 *   (`kylian@gmail`), que le champ mobile ne valide pas. « Identifiants incorrects » fait corriger
 *   la saisie ; le générique la ferait renvoyer à l'identique.
 * - **429** : trop de tentatives — il faut attendre, pas réessayer tout de suite.
 * - le reste, panne réseau comprise : le générique. Annoncer des identifiants faux sur une panne
 *   ferait retaper un mot de passe juste.
 */
export function signInErrorKey(error: {
  status?: number | undefined;
  code?: string | undefined;
}): string {
  if (error.status === 403 && error.code === "EMAIL_NOT_VERIFIED") {
    return "auth.errors.emailNotVerified";
  }
  if (error.status === 401 || error.status === 400) return "auth.errors.invalidCredentials";
  if (error.status === 429) return "auth.errors.tooManyAttempts";
  return "auth.errors.generic";
}

/** Où en est le renvoi du lien de vérification, sur l'écran « vérifie ta boîte » (#270). */
export type ResendState = "idle" | "sending" | "sent" | "failed";

/**
 * L'issue d'un renvoi du lien de vérification : `send` est l'appel au client Better Auth.
 *
 * Le client REND son erreur au lieu de lever : sans cette lecture, un refus — la limite de débit,
 * par exemple — s'afficherait « c'est reparti ». Et le réseau, lui, lève : sans le `catch`, l'écran
 * resterait sur « envoi… ».
 */
export async function resendOutcome(
  send: () => Promise<{ error: unknown }>,
): Promise<Extract<ResendState, "sent" | "failed">> {
  try {
    const { error } = await send();
    return error == null ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
