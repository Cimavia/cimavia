import { type EraseAccountInput, erasureOutcomeUnknown } from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { accountErasureApi } from "@/feature/account/api";
import { resetAccountData } from "@/shared/lib/account-reset";
import { isUnauthorizedError } from "@/shared/lib/api";
import { authClient, holdSessionRecheck, releaseSessionRecheck } from "@/shared/lib/auth";

/** Juste après une coupure, `/get-session` peut ne jamais répondre : le formulaire doit rendre la main. */
const SESSION_READ_TIMEOUT_MS = 5_000;

/** `false` quand on ne sait pas : seule une réponse claire de l'API vaut preuve d'un départ. */
async function sessionIsGone(): Promise<boolean> {
  try {
    const { data, error } = await authClient.getSession({
      fetchOptions: { signal: AbortSignal.timeout(SESSION_READ_TIMEOUT_MS) },
    });
    return error == null && data == null;
  } catch {
    return false;
  }
}

/**
 * Supprime le compte connecté, puis quitte l'app pour la page de confirmation (#795).
 *
 * Pas de `signOut` : le `204` dit que la session n'existe plus. Un rechargement complet plutôt
 * qu'un `navigate` : la session gardée en mémoire par Better Auth ferait ouvrir la fenêtre de
 * reconnexion de `CmvRoleGate` sur un compte disparu. `replace` : Retour ne ramène pas au formulaire.
 *
 * La session tombe au COMMIT, avant le `204` (l'API envoie encore l'e-mail) : la relecture sur 401
 * reste suspendue jusqu'au départ, sinon une lecture de la page ouvrirait cette même fenêtre.
 *
 * Une réponse perdue en route (coupure, 502 du tunnel) ne dit pas si le compte est parti : la session
 * est relue, et si elle n'existe plus, la mutation RÉUSSIT. Le 401 d'un nouvel essai a le même sens,
 * mais seulement après une issue inconnue ; sans elle, la session était perdue avant le geste. Après
 * une issue inconnue, la suspension reste posée : le 401 du prochain sondage ouvrirait la fenêtre.
 */
export function useAccountErasure() {
  const queryClient = useQueryClient();
  const outcomeWasUnknown = useRef(false);

  useEffect(() => releaseSessionRecheck, []);

  async function erasedDespite(error: unknown): Promise<boolean> {
    if (isUnauthorizedError(error)) return outcomeWasUnknown.current;
    if (!erasureOutcomeUnknown(error)) return false;
    outcomeWasUnknown.current = true;
    return sessionIsGone();
  }

  return useMutation({
    // Hors ligne, le mode par défaut mettrait le geste en attente : il partirait tout seul au retour
    // du réseau, bien après que la personne a cessé d'y penser. Ici, il échoue tout de suite.
    networkMode: "always",
    mutationFn: async (input: EraseAccountInput) => {
      try {
        await accountErasureApi.erase(input);
      } catch (error) {
        if (!(await erasedDespite(error))) throw error;
      }
    },
    onMutate: holdSessionRecheck,
    onSuccess: () => {
      resetAccountData(queryClient);
      window.location.replace("/account/deleted");
    },
    onError: () => {
      if (!outcomeWasUnknown.current) releaseSessionRecheck();
    },
  });
}
