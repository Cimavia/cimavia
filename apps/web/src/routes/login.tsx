import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "@/feature/auth";

type LoginSearch = {
  /**
   * La page d'où la garde a renvoyé ici, pour y revenir une fois connecté (#337). Brute à ce
   * stade : elle vient de l'URL, donc de n'importe qui — `LoginScreen` ne la suit qu'après
   * `safeRedirect`.
   */
  redirect?: string;
};

export function parseLoginSearch(search: Record<string, unknown>): LoginSearch {
  return typeof search.redirect === "string" ? { redirect: search.redirect } : {};
}

export const Route = createFileRoute("/login")({
  validateSearch: parseLoginSearch,
  component: LoginScreen,
});
