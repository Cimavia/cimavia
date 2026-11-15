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
 * Toute autre valeur d'`error` est ramenée à `INVALID_TOKEN`, comme `/verify-email` ramène les
 * siennes à `failed` : c'est la seule que Better Auth pose sur cette route, et l'écran ne recopie
 * jamais ce qu'il lit dans l'URL.
 */
export const RESET_LINK_REFUSED = "INVALID_TOKEN";
export type ResetPasswordSearch = { token?: string; error?: typeof RESET_LINK_REFUSED };

export function parseResetPasswordSearch(search: Record<string, unknown>): ResetPasswordSearch {
  const { token, error } = search;
  return {
    ...(typeof token === "string" && token !== "" && { token }),
    ...(error != null && error !== "" && { error: RESET_LINK_REFUSED }),
  };
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: parseResetPasswordSearch,
  component: ResetPasswordScreen,
});
