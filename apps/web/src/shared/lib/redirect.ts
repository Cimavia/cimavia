/** Les écrans d'où revenir après connexion n'aurait aucun sens : on y retournerait se connecter. */
const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

/**
 * La cible où ramener l'utilisateur après connexion, ou `null` si `value` n'en est pas une sûre
 * (#337).
 *
 * Elle arrive par l'URL (`/login?redirect=…`), donc de n'importe qui : un lien piégé peut y mettre
 * `https://site-piege.example` et se servir de la page de connexion de cimavia pour y envoyer un
 * utilisateur fraîchement authentifié — une redirection ouverte. Seul un chemin INTERNE passe :
 *
 * - il commence par `/` — une URL absolue ou un `javascript:` est refusé ;
 * - il ne commence pas par `//` ni `/\` — deux formes que le navigateur lit comme une AUTRE
 *   origine (`//site-piege.example`), alors qu'elles ont l'air d'un chemin ;
 * - il ne ramène pas vers un écran d'authentification, qui renverrait aussitôt à l'accueil.
 */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (AUTH_PATHS.includes(pathname ?? "")) return null;
  return value;
}
