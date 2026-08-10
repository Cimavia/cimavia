import type { CapabilityName } from "@cmv/shared";
import type { Href } from "expo-router";

/**
 * La barre d'onglets, décrite comme une donnée — consommée par le layout (qui la rend) ET par
 * l'écran d'entrée (qui décide où atterrir). Une seule table, donc l'entrée ne peut pas envoyer
 * vers un onglet que la nav ne montre pas.
 *
 * Elle vit dans `shared/lib/` et non dans `app/` : `app/` est du routing ou des shells d'une
 * ligne (`architecture-choice.md` §3), et deux fichiers d'`app/` qui s'importent l'un l'autre y
 * introduiraient de la logique.
 *
 * ⚠️ **Expo Router enregistre TOUT fichier de `app/(app)/` comme onglet**, déclaré ou non. Masquer
 * ceux de l'autre capacité ne se fait donc pas en omettant un `<Tabs.Screen>` : il faut
 * `options={{ href: null }}`. Un onglet athlète laissé visible à un coach n'est pas un détail
 * cosmétique — `/planning` et `/messages` appellent des routes `@Roles([ATHLETE])` et répondent
 * 403.
 */
export type TabDefinition = {
  /** Nom du fichier dans `app/(app)/`. */
  name: string;
  labelKey: string;
  icon:
    | "calendar-outline"
    | "barbell-outline"
    | "chatbubble-outline"
    | "receipt-outline"
    | "notifications-outline"
    | "person-outline";
  /** `null` = servi aux DEUX capacités (le compte, les notifications). */
  capability: CapabilityName | null;
};

export const TABS: readonly TabDefinition[] = [
  { name: "planning", labelKey: "nav.planning", icon: "calendar-outline", capability: "athlete" },
  { name: "sessions", labelKey: "nav.sessions", icon: "barbell-outline", capability: "athlete" },
  { name: "messages", labelKey: "nav.messages", icon: "chatbubble-outline", capability: "athlete" },
  { name: "invoices", labelKey: "nav.invoices", icon: "receipt-outline", capability: "athlete" },
  // Le centre de notifications et le compte servent les deux rôles : leurs routes API ne portent
  // aucun `@Roles`, et la lecture des rappels dus y est déjà branchée par rôle côté serveur.
  {
    name: "notifications",
    labelKey: "nav.notifications",
    icon: "notifications-outline",
    capability: null,
  },
  { name: "profile", labelKey: "nav.profile", icon: "person-outline", capability: null },
];

type CapabilityFlags = { isCoach: boolean; isAthlete: boolean };

function isGranted(tab: TabDefinition, capabilities: CapabilityFlags): boolean {
  if (tab.capability == null) return true;
  return tab.capability === "coach" ? capabilities.isCoach : capabilities.isAthlete;
}

/** Ce qu'un compte voit, dans l'ordre de la table. */
export function visibleTabs(capabilities: CapabilityFlags): readonly TabDefinition[] {
  return TABS.filter((tab) => isGranted(tab, capabilities));
}

/**
 * Où atterrit un compte après connexion : son PREMIER onglet visible.
 *
 * Dérivé de la table plutôt que codé en dur, et c'est le point : le jour où un onglet coach est
 * ajouté en tête, l'entrée le suit sans qu'on y touche. `null` = aucun onglet, ce qui ne peut
 * arriver qu'à un compte sans capacité connue (fail closed de `capabilitiesOf`).
 */
export function landingTab(capabilities: CapabilityFlags): Href | null {
  const first = visibleTabs(capabilities)[0];
  return first == null ? null : (`/${first.name}` as Href);
}

/**
 * Vers où renvoyer quand le chemin courant n'est pas ouvert à cette capacité — `null` s'il l'est,
 * ou s'il ne correspond à aucun onglet (le routeur s'en charge).
 *
 * ⚠️ `href: null` **ne suffit pas**. Il retire l'onglet de la barre, mais le navigateur monte quand
 * même sa **route initiale** — le premier écran déclaré. Un coach atterrissait donc sur `/planning`
 * sans bouton d'onglet actif : la barre était juste, l'écran dessous ne l'était pas. Expo Router ne
 * permet pas de choisir `initialRouteName` dynamiquement, d'où cette garde.
 *
 * Elle couvre aussi ce qu'aucune barre d'onglets ne protège : un lien profond, une notification
 * ouverte, un état de navigation restauré au redémarrage.
 */
export function redirectForPath(pathname: string, capabilities: CapabilityFlags): Href | null {
  const current = TABS.find(
    (tab) => pathname === `/${tab.name}` || pathname.startsWith(`/${tab.name}/`),
  );
  if (current == null || isGranted(current, capabilities)) return null;
  return landingTab(capabilities);
}
