import { createFileRoute } from "@tanstack/react-router";
import { VerifyEmailScreen } from "@/feature/auth";

/**
 * `?error=…` — posé par la redirection de Better Auth quand le jeton n'a pas servi
 * (`TOKEN_EXPIRED`, `INVALID_TOKEN`, `USER_NOT_FOUND`…). Son absence veut dire que l'adresse est
 * vérifiée : l'API ne redirige ici qu'APRÈS avoir écrit `emailVerified`.
 *
 * Réduit à un booléen : l'écran dit la même chose pour toutes les erreurs, et un code recopié de
 * l'URL dans la page serait un texte que n'importe qui peut forger.
 *
 * ⚠️ Cette route est nommée par l'API (`EmailVerificationMailer`) : la renommer casse le lien de
 * l'e-mail en silence (dette I-2).
 */
export type VerifyEmailSearch = { failed: boolean };

export function parseVerifyEmailSearch(search: Record<string, unknown>): VerifyEmailSearch {
  return { failed: search.error != null && search.error !== "" };
}

export const Route = createFileRoute("/verify-email")({
  validateSearch: parseVerifyEmailSearch,
  component: VerifyEmailScreen,
});
