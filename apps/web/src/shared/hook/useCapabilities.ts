import { type Capabilities, capabilitiesOf } from "@cmv/shared";
import { authClient } from "@/shared/lib/auth";

/**
 * Les capacités du compte connecté, plus les deux états que la session peut avoir en plus de son
 * contenu. Les trois sont nécessaires pour décider : sans `isPending`, un écran gardé se refermerait
 * le temps que la session se résolve ; sans `isAuthenticated`, on confondrait « pas connecté » avec
 * « connecté sans capacité ».
 */
export type SessionCapabilities = Capabilities & {
  /** La session n'est pas encore résolue — ne rien décider tant que c'est vrai. */
  isPending: boolean;
  /**
   * Session résolue ET présente. Distinct de « aucune capacité » : un compte connecté dont le rôle
   * est inconnu du client est authentifié sans rien pouvoir faire (cf. `capabilitiesOf`).
   */
  isAuthenticated: boolean;
};

/**
 * Point d'entrée unique des capacités côté web. Aucun écran ne lit `authSession.user.role` pour
 * décider d'un droit : la dérivation vit dans `@cmv/shared` (testée), et c'est elle qui changera
 * seule quand #9/#10 remplaceront le rôle exclusif par `isCoach`/`isAthlete`.
 */
export function useCapabilities(): SessionCapabilities {
  const { data, isPending } = authClient.useSession();
  return { ...capabilitiesOf(data?.user), isPending, isAuthenticated: data != null };
}
