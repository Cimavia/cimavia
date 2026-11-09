import { createConfirmedErasure } from "@cmv/shared";
import { useMutation } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { useState } from "react";
import { accountErasureApi } from "@/feature/account/api";
import { blockTrackingStore } from "@/feature/plan/lib/local-tracking-store";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";

/** Sa réponse ne sert à rien : le geste ne doit pas attendre un réseau qui vient de tomber. */
const SIGN_OUT_TIMEOUT_MS = 3_000;

/** La pile racine : expo-router ne type pas ses noms de route pour `reset`. */
type RootStack = {
  reset: (state: {
    index: number;
    routes: readonly { name: "login"; params: { erased: string } }[];
  }) => void;
};

/**
 * Ce que le téléphone garde du compte parti. Une purge qui résiste n'annonce pas d'échec : le compte
 * n'existe plus. La prochaine connexion repassera par `resetAccountData` pour le cache ; le suivi
 * local, lui, restera sur le disque, sans que le compte suivant puisse ouvrir ces séances (SC-7).
 *
 * `revokeCurrentPushToken` n'y est pas : le token est parti en cascade avec le compte. `signOut`
 * y est, malgré la session morte : le plugin Expo vide le cookie et la session AVANT d'appeler le
 * réseau, et c'est la seule porte publique vers ce stockage (`auth.sign-out.test.ts` le garde).
 * En dernier : la session effacée, `(app)` et `CmvCapabilityGate` ne savent plus qui est là.
 */
async function purgeDevice(): Promise<void> {
  await Promise.allSettled([blockTrackingStore.purge(), resetAccountData()]);
  await authClient.signOut({ fetchOptions: { timeout: SIGN_OUT_TIMEOUT_MS } }).catch(() => {});
}

/**
 * Supprime le compte connecté, purge l'appareil, puis ouvre la connexion avec sa confirmation (#796).
 *
 * `reset` et non `replace` : la pile entière part d'un seul geste. Un `replace` laisserait les onglets
 * sous `/login`, et Retour ramènerait sur un compte disparu ; un `dismissAll` d'abord redonnerait le
 * focus à l'écran du dessous, dont la garde redirigerait faute de session.
 */
export function useAccountErasure() {
  const navigation = useNavigation<RootStack>();
  const [erasure] = useState(() =>
    createConfirmedErasure(accountErasureApi, (options) => authClient.getSession(options)),
  );

  return useMutation({
    // Hors ligne, le mode par défaut mettrait le geste en attente : il partirait tout seul au retour
    // du réseau, bien après que la personne a cessé d'y penser. Ici, il échoue tout de suite.
    networkMode: "always",
    mutationFn: erasure.erase,
    onSuccess: async () => {
      await purgeDevice();
      navigation.reset({ index: 0, routes: [{ name: "login", params: { erased: "1" } }] });
    },
  });
}
