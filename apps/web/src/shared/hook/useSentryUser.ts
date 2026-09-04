import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import { authClient } from "@/shared/lib/auth";

/**
 * Rattache les erreurs Sentry au compte connecté — l'`id` seul, ni nom ni e-mail (#183).
 *
 * Sans lui, une erreur est anonyme et l'on ne distingue pas UN utilisateur qui boucle deux cents
 * fois de DEUX CENTS utilisateurs touchés. C'est ce chiffre-là qui décide si l'on corrige le soir
 * même, et aucune autre donnée n'est nécessaire pour l'obtenir : Sentry ne détient qu'un
 * pseudonyme, qui ne redevient une personne qu'en base, chez nous.
 *
 * L'EFFACEMENT est la moitié qu'on oublie. `setUser(null)` à la disparition de la session : sans
 * lui, le compte suivant sur le même navigateur hériterait de l'identité du précédent, et les
 * erreurs seraient attribuées à quelqu'un qui n'était pas là.
 *
 * La session ne s'obtient que par `authClient.useSession()`, un hook — d'où un hook ici et non une
 * ligne dans `shared/lib/auth.ts`. Il s'appelle depuis `routes/__root.tsx` : c'est le SEUL
 * composant monté sous le routeur sur toutes les routes. `CmvAppShell`, que #181 proposait, est
 * rendu par quinze écrans et par aucun des écrans d'authentification.
 */
export function useSentryUser(): void {
  const { data } = authClient.useSession();
  const id = data?.user.id;

  useEffect(() => {
    Sentry.setUser(id ? { id } : null);
  }, [id]);
}
