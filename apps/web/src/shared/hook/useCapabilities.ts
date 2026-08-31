import { type Capabilities, type CapabilityName, capabilitiesOf, Role } from "@cmv/shared";
import { useSearch } from "@tanstack/react-router";
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
 * Depuis #129, le titre vient de l'**URL** (`?as=`), posée par les deux entrées de navigation :
 * c'est un choix explicite, partageable et survivant au rechargement, là où un état d'écran se
 * perdrait. Le **persona** (`role`) ne sert plus que de repli, pour les chemins qui atteignent ces
 * écrans sans passer par la nav — un lien profond, un signet, une notification. Ce n'est pas un
 * droit dérivé du rôle : la garde, elle, lit les capacités.
 */
export function useExercisedCapability(): CapabilityName | null {
  const { data } = authClient.useSession();
  const search = useSearch({ strict: false }) as { as?: unknown };
  const { isCoach, isAthlete } = capabilitiesOf(data?.user);
  if (!isCoach || !isAthlete) return null;
  if (search.as === "coach" || search.as === "athlete") return search.as;
  return data?.user.role === Role.ATHLETE ? "athlete" : "coach";
}

/**
 * Le titre effectivement exercé — toujours une valeur, là où `useExercisedCapability` rend `null`
 * quand la question ne se pose pas.
 *
 * Pour la PRÉSENTATION des écrans servis aux deux capacités : leur titre, leurs textes de liste
 * vide, et ce qu'on peut y faire. Un compte à double capacité qui lit ses factures « en tant
 * qu'athlète » ne doit pas y voir l'en-tête du coach ni le bouton « marquer payée » — sa capacité
 * POSSÉDÉE dirait pourtant oui aux deux.
 *
 * Ce n'est pas une garde : qui entre est décidé par la route et le scope tenant. C'est ce que
 * l'écran montre une fois entré.
 */
export function useActingCapability(): CapabilityName {
  const exercised = useExercisedCapability();
  const { isCoach } = useCapabilities();
  return exercised ?? (isCoach ? "coach" : "athlete");
}
