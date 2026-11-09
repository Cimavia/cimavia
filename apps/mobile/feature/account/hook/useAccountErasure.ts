import { type AccountErasureApi, createConfirmedErasure, erasureOutcomeUnknown } from "@cmv/shared";
import { useMutation } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { accountErasureApi } from "@/feature/account/api";
import { blockTrackingStore } from "@/feature/plan/lib/local-tracking-store";
import { useSessionDeparture } from "@/shared/hook/useSessionGuard";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";

/** Sa réponse ne sert à rien : le geste ne doit pas attendre un réseau qui vient de tomber. */
const SIGN_OUT_TIMEOUT_MS = 3_000;

/** Large : l'effacement d'un gros compte prend du temps, et n'est borné que pour rendre la main. */
const ERASE_TIME_LIMIT_MS = 30_000;

/**
 * Une coupure en plein envoi ne fait pas échouer la requête : elle reste pendue sur sa connexion, et
 * le retour système est bloqué pendant l'envoi. Passé le délai, c'est une issue inconnue comme une
 * autre : l'envoi peut encore aboutir, et `createConfirmedErasure` sait lire ce cas au prochain essai.
 */
function withTimeLimit(api: AccountErasureApi): AccountErasureApi {
  return {
    erase: (input) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("La suppression n'a pas répondu à temps")),
          ERASE_TIME_LIMIT_MS,
        );
        api
          .erase(input)
          .then(resolve, reject)
          .finally(() => clearTimeout(timer));
      }),
  };
}

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
 */
async function purgeDevice(): Promise<void> {
  await Promise.allSettled([blockTrackingStore.purge(), resetAccountData()]);
  await authClient.signOut({ fetchOptions: { timeout: SIGN_OUT_TIMEOUT_MS } }).catch(() => {});
}

/**
 * Supprime le compte connecté, purge l'appareil, puis ouvre la connexion avec sa confirmation (#796).
 *
 * `reset` et non `replace` : la pile entière part d'un seul geste. Un `replace` laisserait les onglets
 * sous `/login`, et Retour ramènerait sur un compte disparu.
 *
 * Le départ est annoncé dès l'envoi : la session tombe au COMMIT, avant la réponse, et la moindre
 * relecture ouvrirait la fenêtre de reconnexion sur un compte disparu (#439).
 */
export function useAccountErasure() {
  const navigation = useNavigation<RootStack>();
  const departure = useSessionDeparture();
  useEffect(() => departure.cancel, [departure]);
  const [erasure] = useState(() =>
    createConfirmedErasure(withTimeLimit(accountErasureApi), (options) =>
      authClient.getSession(options),
    ),
  );

  return useMutation({
    // Hors ligne, le mode par défaut mettrait le geste en attente : il partirait tout seul au retour
    // du réseau, bien après que la personne a cessé d'y penser. Ici, il échoue tout de suite.
    networkMode: "always",
    mutationFn: erasure.erase,
    onMutate: departure.begin,
    // Issue inconnue : le compte est peut-être parti, le départ reste annoncé pour le nouvel essai,
    // qui saura le confirmer. Quitter l'écran l'annule (plus haut).
    onError: (error) => {
      if (!erasureOutcomeUnknown(error)) departure.cancel();
    },
    onSuccess: async () => {
      await purgeDevice();
      navigation.reset({ index: 0, routes: [{ name: "login", params: { erased: "1" } }] });
      departure.complete();
    },
  });
}
