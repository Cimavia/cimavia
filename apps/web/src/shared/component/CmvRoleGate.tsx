import { type CapabilityName, hasCapability } from "@cmv/shared";
import { Navigate, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "@/shared/hook/useCapabilities";

type CmvRoleGateProps = {
  /**
   * La capacité exigée pour monter l'écran, ou la LISTE de celles qui suffisent — une seule
   * suffit alors. Deux capacités ne veut pas dire « écran partagé » : `/invoices` sert la même
   * route à des contenus différents, c'est l'écran qui choisit ce qu'il montre, pas la garde.
   */
  capability: CapabilityName | readonly CapabilityName[];
  children: ReactNode;
  /**
   * Rendu à la place de l'écran quand la capacité manque. Défaut : retour à l'accueil — le bon
   * choix quand l'utilisateur a *un* chez-lui ailleurs. Une route dont l'autre rôle n'a aucun
   * équivalent passe plutôt un écran d'accueil dédié (cf. `/`).
   */
  fallback?: ReactNode;
};

/**
 * Garde de capacité, posée dans le **fichier de route** et non dans l'écran :
 *
 *     component: () => (
 *       <CmvRoleGate capability="coach">
 *         <InvoicesScreen />
 *       </CmvRoleGate>
 *     )
 *
 * POURQUOI la route et pas l'écran — c'est le point entier. Une garde en tête d'écran est un
 * `return` anticipé, or **les hooks s'exécutent avant tout `return`** : les requêtes de l'écran
 * partent quand même. `MessagesScreen` appelle `useAthletes()` (`GET /athletes`, coach seul) et
 * `ConversationScreen` (mobile) appelle `useMyCoach()` (`GET /me/coach`, athlète seul) — ouvrir ces
 * écrans à l'autre rôle avec une garde interne donnerait un 403 sur sa propre page. Ici l'écran
 * n'est pas monté du tout tant que la capacité n'est pas confirmée, donc aucun de ses hooks ne part.
 *
 * POURQUOI pas un `beforeLoad` TanStack : il s'exécute hors React, alors que la session Better Auth
 * ne s'obtient que par `authClient.useSession()`. La porter dans le contexte du routeur imposerait
 * un `router.invalidate()` à chaque connexion/déconnexion et ouvrirait la porte aux boucles de
 * redirection. Une frontière de composant dans un fichier qui ne fait déjà que du routage reste du
 * routage.
 *
 * Effet de bord voulu : la route **déclare pour qui elle est**, au même endroit que son chemin —
 * c'est ce qui permet à la navigation de rester en phase avec ce qui est réellement accessible.
 */
export function CmvRoleGate({ capability, children, fallback }: Readonly<CmvRoleGateProps>) {
  const { t } = useTranslation();
  const { isPending, isAuthenticated, ...capabilities } = useCapabilities();
  /**
   * Le routeur, et non `useLocation()` : ce dernier ABONNE la garde à chaque changement d'adresse,
   * y compris à celui qu'elle déclenche elle-même. Or `<Navigate>` renavigue à chaque rendu dont
   * les props sont neuves — la garde se relançait donc à chaque étape de sa propre redirection,
   * jusqu'au « Maximum update depth ». L'adresse n'est lue qu'au moment de rediriger : une lecture
   * ponctuelle suffit.
   */
  const router = useRouter();

  // Session non résolue : on n'accorde ni ne refuse. Décider ici afficherait l'écran de refus le
  // temps d'un aller-retour, sur chaque chargement de page.
  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }

  // Pas connecté : directement la connexion. Les gardes recopiées renvoyaient vers `/`, qui
  // renvoyait à son tour vers `/login` — deux sauts pour la même destination.
  // La page demandée part avec (#337) : le coach qui ouvrait un débrief depuis une notification y
  // revient une fois connecté, au lieu d'atterrir sur l'accueil.
  // `replace` sur les DEUX renvois : la page refusée ne reste pas dans l'historique, sinon Retour y
  // ramène, elle renvoie aussitôt plus loin, et l'utilisateur tourne en rond.
  if (!isAuthenticated) {
    return <Navigate to="/login" search={{ redirect: router.state.location.href }} replace />;
  }

  // `typeof` plutôt que `Array.isArray`, qui élargit un tableau readonly en `any[]`.
  const accepted = typeof capability === "string" ? [capability] : capability;
  if (!accepted.some((name) => hasCapability(capabilities, name))) {
    return (
      fallback ?? (
        <Navigate to="/" search={{ q: undefined, filter: undefined, athlete: undefined }} replace />
      )
    );
  }

  return <>{children}</>;
}
