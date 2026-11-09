import { isSessionLost } from "@cmv/shared";
import { type ReactNode, useMemo, useState } from "react";
import { View } from "react-native";
import { ReauthOverlay } from "@/feature/auth";
import { SessionGuardContext, type SessionOwner } from "@/shared/hook/useSessionGuard";
import { authClient } from "@/shared/lib/auth";

/**
 * Surveille la session sur TOUTES les routes (#439) : posée à la racine, elle n'a à décider qu'une
 * fois, là où le web pose une garde par route.
 *
 * Tant qu'une session a été vue, l'app garde son compte (`owner`). Si la session tombe, l'écran
 * reste monté sous la fenêtre de reconnexion, et `useCapabilities` continue de répondre pour ce
 * compte : ni les onglets ni `CmvCapabilityGate` ne redirigent, ce qui démonterait le Feedback en
 * cours. Seule une réponse du serveur vaut perte : hors ligne, Better Auth garde la session.
 *
 * Toujours la même `View` autour de l'écran, perdu ou non : un autre parent le remonterait.
 */
export function CmvSessionGuard({ children }: Readonly<{ children: ReactNode }>) {
  const { data: session } = authClient.useSession();
  const [owner, setOwner] = useState<SessionOwner | null>(null);
  const [departing, setDeparting] = useState(false);

  // `?.` sur `user` : une réponse illisible n'en a pas, quoi qu'en disent les types.
  const user = session?.user;
  const sameAccount = owner == null || user?.id === owner.id;
  // Tenu à jour : ce sont les capacités du MOMENT que l'écran doit garder pendant la perte. Better
  // Auth conserve l'objet d'une relecture identique, ce qui arrête ce rendu après un passage.
  if (!departing && user != null && sameAccount && user !== owner) setOwner(user);

  const lost = !departing && isSessionLost(owner, session);
  const retained = owner != null && user?.id !== owner.id ? owner : null;

  // Stable : un hook la range dans ses dépendances, et le compte retenu change sans elle.
  const departure = useMemo(
    () => ({
      begin: () => setDeparting(true),
      complete: () => {
        setOwner(null);
        setDeparting(false);
      },
      cancel: () => setDeparting(false),
    }),
    [],
  );
  const value = useMemo(() => ({ retained, departure }), [retained, departure]);

  return (
    <SessionGuardContext.Provider value={value}>
      <View
        className="flex-1"
        accessibilityElementsHidden={lost}
        importantForAccessibility={lost ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {lost && owner != null && <ReauthOverlay owner={owner} />}
    </SessionGuardContext.Provider>
  );
}
