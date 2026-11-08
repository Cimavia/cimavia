import type { EraseAccountInput } from "../dto/account-erasure.schema";
import { type ApiClient, ApiError } from "./client";
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
