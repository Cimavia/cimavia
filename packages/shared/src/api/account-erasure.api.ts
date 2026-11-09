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

/** Juste après une coupure, `/get-session` peut ne jamais répondre : le formulaire doit rendre la main. */
const SESSION_READ_TIMEOUT_MS = 5_000;

/**
 * `authClient.getSession`, réduit à ce que la relecture en attend : chaque app a son client. Par
 * `timeout` et non `AbortSignal.timeout`, absent de React Native.
 */
export type SessionReader = (options: {
  fetchOptions: { timeout: number };
}) => Promise<{ data: unknown; error: unknown }>;

/** `false` quand on ne sait pas : seule une réponse claire de l'API vaut preuve d'un départ. */
async function sessionIsGone(readSession: SessionReader): Promise<boolean> {
  try {
    const { data, error } = await readSession({
      fetchOptions: { timeout: SESSION_READ_TIMEOUT_MS },
    });
    return error == null && data == null;
  } catch {
    return false;
  }
}

export type ConfirmedErasure = {
  erase: (input: EraseAccountInput) => Promise<void>;
  outcomeWasUnknown: () => boolean;
};

/**
 * La suppression, telle qu'un écran la vit (#795, #796) : une instance par écran, parce que
 * l'issue d'un essai éclaire le suivant.
 *
 * Une réponse perdue en route (coupure, 502 du tunnel) ne dit pas si le compte est parti : la session
 * est relue, et si elle n'existe plus, l'appel RÉUSSIT. Le 401 d'un nouvel essai a le même sens,
 * mais seulement après une issue inconnue ; sans elle, la session était perdue avant le geste.
 */
export function createConfirmedErasure(
  api: AccountErasureApi,
  readSession: SessionReader,
): ConfirmedErasure {
  let unknown = false;

  async function erasedDespite(error: unknown): Promise<boolean> {
    if (isUnauthorizedError(error)) return unknown;
    // Un refus écrit par l'API vient d'un compte qui existe : l'essai d'avant ne l'a pas emporté.
    unknown = erasureOutcomeUnknown(error);
    if (!unknown) return false;
    return sessionIsGone(readSession);
  }

  return {
    erase: async (input) => {
      try {
        await api.erase(input);
      } catch (error) {
        if (!(await erasedDespite(error))) throw error;
      }
    },
    outcomeWasUnknown: () => unknown,
  };
}
