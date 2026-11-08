import { VERIFY_EMAIL_PASSWORD_REQUIRED } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { VerifyEmailScreen } from "@/feature/auth";

/**
 * `?error=…` — posé par la redirection de l'API quand le lien n'a pas confirmé l'adresse. Son
 * absence veut dire que l'adresse est vérifiée : l'API ne redirige ici qu'APRÈS avoir écrit
 * `emailVerified`.
 *
 * Réduit à trois issues, sans recopier le code : un texte tiré de l'URL serait forgeable.
 * - `passwordRequired` : le compte n'a plus de mot de passe — une seconde inscription l'a effacé
 *   (#270). Le lien a bien été refusé, mais la suite n'est pas « se connecter » : il faut en choisir
 *   un, et la réinitialisation confirme l'adresse au passage.
 * - `failed` : expiré, falsifié… (`TOKEN_EXPIRED`, `INVALID_TOKEN`) — se connecter renvoie un lien neuf.
 *
 * ⚠️ Cette route est nommée par l'API (`EmailVerificationMailer`) : la renommer casse le lien de
 * l'e-mail en silence (dette I-2).
 */
export type VerifyEmailOutcome = "verified" | "failed" | "passwordRequired";
export type VerifyEmailSearch = { outcome: VerifyEmailOutcome };

export function parseVerifyEmailSearch(search: Record<string, unknown>): VerifyEmailSearch {
  const { error } = search;
  if (error === VERIFY_EMAIL_PASSWORD_REQUIRED) return { outcome: "passwordRequired" };
  if (error != null && error !== "") return { outcome: "failed" };
  return { outcome: "verified" };
}

export const Route = createFileRoute("/verify-email")({
  validateSearch: parseVerifyEmailSearch,
  component: VerifyEmailScreen,
});
