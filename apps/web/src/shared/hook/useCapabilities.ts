import { type Capabilities, type CapabilityName, capabilitiesOf, Role } from "@cmv/shared";
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
   * Session résolue ET présente. Distinct de « aucune capacité » : un compte connecté dont aucune
   * capacité ne remonte est authentifié sans rien pouvoir faire (cf. `capabilitiesOf`).
   */
  isAuthenticated: boolean;
};

/**
 * Point d'entrée unique des capacités côté web. Aucun écran ne lit la session pour décider d'un
 * droit : la dérivation vit dans `@cmv/shared` (testée). C'est ce qui a permis à #9 de remplacer
 * le rôle exclusif par `isCoach`/`isAthlete` sans toucher un seul écran — seul le corps de
 * `capabilitiesOf` a changé, comme annoncé.
 */
export function useCapabilities(): SessionCapabilities {
  const { data, isPending } = authClient.useSession();
  return { ...capabilitiesOf(data?.user), isPending, isAuthenticated: data != null };
}

/**
 * Le titre auquel les écrans partagés (factures, messagerie) lisent — `null` quand la question ne
 * se pose pas.
 *
 * Elle ne se pose QUE pour un compte à double capacité : lui seul a des factures émises **et**
 * reçues, des fils des deux côtés. Pour tous les autres, l'API n'a qu'une réponse possible et
 * l'URL reste nue — c'est ce qui fait que rien ne change pour les comptes existants.
 *
 * Le titre vient du **persona** (`role`), et c'est exactement l'usage que #9 lui a laissé :
 * l'univers dans lequel le compte atterrit. Ce n'est pas un droit dérivé du rôle — la garde, elle,
 * lit les capacités — c'est une vue par défaut, en attendant que #129 donne deux entrées de
 * navigation et donc un choix explicite.
 */
export function useExercisedCapability(): CapabilityName | null {
  const { data } = authClient.useSession();
  const { isCoach, isAthlete } = capabilitiesOf(data?.user);
  if (!isCoach || !isAthlete) return null;
  return data?.user.role === Role.ATHLETE ? "athlete" : "coach";
}
