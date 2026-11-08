import { type EraseAccountInput, erasureFailureOf } from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { accountErasureApi } from "@/feature/account/api";
import { resetAccountData } from "@/shared/lib/account-reset";
import { isUnauthorizedError } from "@/shared/lib/api";
import { authClient } from "@/shared/lib/auth";

/** `false` quand on ne sait pas : seule une réponse claire de l'API vaut preuve d'un départ. */
async function sessionIsGone(): Promise<boolean> {
  try {
    const { data, error } = await authClient.getSession();
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
 * Sur une erreur sans refus reconnu, la session est relue : le compte part au COMMIT, et une réponse
 * perdue en route (coupure, 502 du tunnel) laisserait croire à un échec, puis demanderait le mot de
 * passe d'un compte qui n'existe plus. Un 401 n'est pas relu : la session était déjà perdue AVANT le
 * geste, rien n'a été supprimé.
 */
export function useAccountErasure() {
  const queryClient = useQueryClient();

  function leave() {
    resetAccountData(queryClient);
    window.location.replace("/account/deleted");
  }

  return useMutation({
    mutationFn: (input: EraseAccountInput) => accountErasureApi.erase(input),
    onSuccess: leave,
    onError: async (error) => {
      if (erasureFailureOf(error) != null || isUnauthorizedError(error)) return;
      if (await sessionIsGone()) leave();
    },
  });
}
