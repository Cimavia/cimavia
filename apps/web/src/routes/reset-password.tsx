import { RESET_LINK_REFUSED } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordScreen } from "@/feature/auth";

/**
 * Ce que la redirection de Better Auth pose sur l'URL, après avoir vérifié le jeton du lien de
 * l'e-mail (#437) :
 * - `?token=…` — le jeton est valable. Optionnel : l'écran le retire de l'URL dès qu'il l'a lu
 *   (#335), et doit aussi dire qu'il manque quand on arrive sans, page rechargée comprise.
 * - `?error=INVALID_TOKEN` — le lien est mort : jeton inconnu, déjà consommé ou expiré. Il arrive
 *   SANS `token`. Rien de secret : il reste dans l'URL, et une page rechargée redit la même chose.
 *
 * Et ce que l'écran y pose lui-même, pour la même raison — que la page rechargée redise la même
 * chose : `?error=INVALID_TOKEN` quand l'API refuse le jeton à l'envoi, `?done=true` quand le mot
 * de passe est changé. Sans ce dernier, le jeton parti de l'URL, recharger la page dirait « ouvre
 * le lien reçu par e-mail » à qui vient de réussir.
 *
 * Toute autre valeur d'`error` est ramenée à `INVALID_TOKEN`, comme `/verify-email` ramène les
 * siennes à `failed` : c'est la seule que Better Auth pose sur cette route, et l'écran ne recopie
 * jamais ce qu'il lit dans l'URL.
 */
export type ResetPasswordSearch = {
  token?: string;
  error?: typeof RESET_LINK_REFUSED;
  done?: true;
};

export function parseResetPasswordSearch(search: Record<string, unknown>): ResetPasswordSearch {
  const { token, error, done } = search;
  const hasToken = typeof token === "string" && token !== "";
  const hasError = error != null && error !== "";
  return {
    ...(hasToken && { token }),
    ...(hasError && { error: RESET_LINK_REFUSED }),
    // `true` et non `"true"` : le routeur a déjà lu la valeur de l'URL comme du JSON. Et seul :
    // l'écran ne le pose jamais avec un jeton ou une erreur, et une URL fabriquée ne doit pas
    // annoncer un mot de passe changé à la place du formulaire ou du lien mort.
    ...(done === true && !hasToken && !hasError && { done }),
  };
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: parseResetPasswordSearch,
  component: ResetPasswordScreen,
});
