import * as Sentry from "@sentry/react-native";
import { useEffect } from "react";
import { authClient } from "@/shared/lib/auth";

/**
 * Rattache les erreurs Sentry au compte connecté — l'`id` seul, ni nom ni e-mail (#183).
 *
 * Sans lui, une erreur est anonyme et l'on ne distingue pas UN utilisateur qui boucle deux cents
 * fois de DEUX CENTS utilisateurs touchés. C'est ce chiffre-là qui décide si l'on corrige le soir
 * même, et Sentry ne détient qu'un pseudonyme — il ne redevient une personne qu'en base, chez nous.
 *
 * L'EFFACEMENT est la moitié qu'on oublie, et elle compte PLUS ici que côté web : le mobile garde
 * la session au-delà de la fermeture de l'app (`expo-secure-store`), donc sans `setUser(null)` à
 * la disparition de la session, l'identité du compte précédent survivrait sur le même téléphone —
 * pas seulement le temps d'un onglet resté ouvert, mais jusqu'à la prochaine connexion.
 *
 * Appelé depuis `RootLayout` (`app/_layout.tsx`) : c'est le composant monté sur TOUTES les routes,
 * écrans d'authentification compris — le même raisonnement qui a placé son homologue web dans
 * `routes/__root.tsx` plutôt que dans un shell partagé par les seuls écrans protégés.
 */
export function useSentryUser(): void {
  const { data } = authClient.useSession();
  const id = data?.user.id;

  useEffect(() => {
    Sentry.setUser(id ? { id } : null);
  }, [id]);
}
