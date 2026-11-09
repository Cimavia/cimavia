import type { CapabilitySource } from "@cmv/shared";
import { createContext, useContext } from "react";
import { authClient } from "@/shared/lib/auth";

/** Le compte sous lequel l'app est ouverte, celui qu'une reconnexion a le droit de reprendre. */
export type SessionOwner = CapabilitySource &
  Readonly<{ id: string; email: string; role?: string | null | undefined }>;

/** Un départ voulu, annoncé à la garde pour qu'elle ne le prenne pas pour une perte. */
export type SessionDeparture = {
  /** La session va tomber : ne rien demander, ne rien démonter. */
  begin: () => void;
  /** Le compte est parti : la garde l'oublie. */
  complete: () => void;
  /** Le départ a échoué : si la session est tombée entre-temps, c'est bien une perte. */
  cancel: () => void;
};

type SessionGuard = { retained: SessionOwner | null; departure: SessionDeparture };

const noop = () => {};

/** Hors de `CmvSessionGuard` (tests d'écran) : personne à retenir, aucun départ à suivre. */
export const SessionGuardContext = createContext<SessionGuard>({
  retained: null,
  departure: { begin: noop, complete: noop, cancel: noop },
});

/** Le compte que la session ne montre plus, tant qu'un écran ouvert en dépend (`null` sinon). */
export function useRetainedAccount(): SessionOwner | null {
  return useContext(SessionGuardContext).retained;
}

/**
 * L'utilisateur auquel s'adresse l'écran : le compte retenu pendant une perte, sinon la session.
 * Pour ce qui décide d'une clé de requête ou d'une branche de rendu : les changer sous un écran
 * ouvert le viderait, et sa saisie avec.
 */
export function useAccountUser() {
  const { data } = authClient.useSession();
  return useRetainedAccount() ?? data?.user;
}

export function useSessionDeparture(): SessionDeparture {
  return useContext(SessionGuardContext).departure;
}
