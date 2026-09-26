import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordScreen } from "@/feature/auth";

/**
 * `?token=…` — posé par la redirection de Better Auth depuis le lien du mail. Optionnel : l'écran
 * le retire de l'URL dès qu'il l'a lu (#335), et doit aussi dire qu'il manque quand on arrive sans.
 */
export type ResetPasswordSearch = { token?: string };

export function parseResetPasswordSearch(search: Record<string, unknown>): ResetPasswordSearch {
  return typeof search.token === "string" && search.token !== "" ? { token: search.token } : {};
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: parseResetPasswordSearch,
  component: ResetPasswordScreen,
});
