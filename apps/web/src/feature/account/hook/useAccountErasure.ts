import { createConfirmedErasure } from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { accountErasureApi } from "@/feature/account/api";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient, holdSessionRecheck, releaseSessionRecheck } from "@/shared/lib/auth";

/**
 * Supprime le compte connecté, puis quitte l'app pour la page de confirmation (#795).
 *
 * Pas de `signOut` : le `204` dit que la session n'existe plus. Un rechargement complet plutôt
 * qu'un `navigate` : la session gardée en mémoire par Better Auth ferait ouvrir la fenêtre de
 * reconnexion de `CmvRoleGate` sur un compte disparu. `replace` : Retour ne ramène pas au formulaire.
 *
 * La session tombe au COMMIT, avant le `204` (l'API envoie encore l'e-mail) : la relecture sur 401
 * reste suspendue jusqu'au départ, sinon une lecture de la page ouvrirait cette même fenêtre. Après
 * une issue inconnue (`createConfirmedErasure`), la suspension reste posée : le 401 du prochain
 * sondage ouvrirait la fenêtre.
 */
export function useAccountErasure() {
  const queryClient = useQueryClient();
  const [erasure] = useState(() =>
    createConfirmedErasure(accountErasureApi, (options) => authClient.getSession(options)),
  );

  useEffect(() => releaseSessionRecheck, []);

  return useMutation({
    // Hors ligne, le mode par défaut mettrait le geste en attente : il partirait tout seul au retour
    // du réseau, bien après que la personne a cessé d'y penser. Ici, il échoue tout de suite.
    networkMode: "always",
    mutationFn: erasure.erase,
    onMutate: holdSessionRecheck,
    onSuccess: () => {
      resetAccountData(queryClient);
      window.location.replace("/account/deleted");
    },
    onError: () => {
      if (!erasure.outcomeWasUnknown()) releaseSessionRecheck();
    },
  });
}
