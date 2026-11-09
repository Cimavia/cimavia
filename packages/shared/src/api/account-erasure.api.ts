import type { EraseAccountInput } from "../dto/account-erasure.schema";
import { type ApiClient, ApiError, isUnauthorizedError } from "./client";
import { ProblemType } from "./problem";

/** Supprimer son propre compte (#256), partagé web ↔ mobile : une seule route, la cible est l'acteur. */
export type AccountErasureApi = {
  erase: (input: EraseAccountInput) => Promise<void>;
};

export function createAccountErasureApi(api: ApiClient): AccountErasureApi {
  return {
    erase: (input) => api.post<void>("/me/erasure", input),
  };
}

/** Les refus qui ont leur propre message : chaque client traduit, l'API ne dicte pas le texte. */
export type ErasureFailure = "wrongPassword" | "tooManyAttempts" | "busy";

/**
 * Le refus reconnu, ou `null` pour tout le reste — l'appelant retombe alors sur son message
 * générique.
 *
 * Le `403` se lit au `type` et non au statut : un autre garde peut refuser pour une autre raison, et
 * annoncer « mot de passe incorrect » ferait retaper un mot de passe juste. Le `429` et le `409`
 * n'ont pas de code, seulement une phrase écrite pour les logs : leur statut suffit sur cette route.
 */
export function erasureFailureOf(error: unknown): ErasureFailure | null {
  if (!(error instanceof ApiError)) return null;
  if (error.type === ProblemType.ERASURE_PASSWORD_REJECTED) return "wrongPassword";
  if (error.status === 429) return "tooManyAttempts";
  if (error.status === 409) return "busy";
  return null;
}

/**
 * `true` quand l'échec ne dit pas si le compte est parti : aucune réponse de l'API (coupure, proxy)
 * ou une panne de sa part (le compte part au COMMIT, l'API répond après). Toute autre réponse
 * qu'elle a écrite prouve qu'elle a refusé, et que rien n'a été supprimé.
 */
export function erasureOutcomeUnknown(error: unknown): boolean {
  if (erasureFailureOf(error) != null || isUnauthorizedError(error)) return false;
  return !(error instanceof ApiError) || !error.fromApi || error.status >= 500;
}
