import { type CapabilityName, type CounterpartsDto, UNKNOWN_COUNTERPARTS } from "@cmv/shared";
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
    | "grid-outline"
    | "calendar-outline"
    | "barbell-outline"
    | "chatbubble-outline"
    | "receipt-outline"
    | "notifications-outline"
    | "person-outline";
  /** `null` = servi aux DEUX capacités (le compte, les notifications). */
  capability: CapabilityName | null;
  /**
   * L'onglet n'a d'objet qu'avec un interlocuteur. Absent = il ne dépend que de la capacité, comme
   * tous les autres.
   *
   * Contrairement au web, la condition porte sur le COMPTE et non sur un espace : l'onglet est
   * unique et sert les deux titres, c'est l'écran dessous qui branche (`MessagesScreen`). Il reste
   * donc dès qu'il y a quelqu'un d'UN côté — le compte à double capacité qui coache sans être
   * coaché le garde, et bascule sur « aucun coach » s'il flippe le sélecteur.
   */
  requiresCounterpart?: true;
};

export const TABS: readonly TabDefinition[] = [
  // En TÊTE de la table : c'est aussi ce qui fait du tableau de bord l'atterrissage du coach,
  // `landingTab` prenant le premier onglet visible (cf. `app/index.tsx`).
  { name: "dashboard", labelKey: "nav.dashboard", icon: "grid-outline", capability: "coach" },
  { name: "planning", labelKey: "nav.planning", icon: "calendar-outline", capability: "athlete" },
  { name: "sessions", labelKey: "nav.sessions", icon: "barbell-outline", capability: "athlete" },
  // Servi aux DEUX : `Conversation`/`Message` sont scopés symétriquement, et l'écran branche ce
  // que chacun y voit — N fils pour le coach, un seul pour l'athlète (#34).
  {
    name: "messages",
    labelKey: "nav.messages",
    icon: "chatbubble-outline",
    capability: null,
    requiresCounterpart: true,
  },
  // Servi aux DEUX : `GET /invoices` est une seule ressource scopée par le tenant, et l'écran
  // branche ce qu'on peut en faire (#32).
  { name: "invoices", labelKey: "nav.invoices", icon: "receipt-outline", capability: null },
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

/**
 * L'onglet a-t-il un interlocuteur ? Vrai d'un côté suffit — l'onglet est unique et le sélecteur
 * de l'écran mène à l'autre espace.
 *
 * Un compte ne peut pas garder d'athlètes après avoir retiré `isCoach` (#13 refuse le retrait tant
 * qu'il en reste) : `asCoach` implique donc la capacité, et il n'y a rien à croiser ici.
 */
function hasCounterpart(tab: TabDefinition, counterparts: CounterpartsDto): boolean {
  if (tab.requiresCounterpart !== true) return true;
  return counterparts.asCoach || counterparts.asAthlete;
}

/** Ce qu'un compte voit, dans l'ordre de la table. */
export function visibleTabs(
  capabilities: CapabilityFlags,
  counterparts: CounterpartsDto,
): readonly TabDefinition[] {
  return TABS.filter((tab) => isGranted(tab, capabilities) && hasCounterpart(tab, counterparts));
}

/**
 * Où atterrit un compte après connexion : son PREMIER onglet visible.
 *
 * Dérivé de la table plutôt que codé en dur, et c'est le point : le jour où un onglet coach est
 * ajouté en tête, l'entrée le suit sans qu'on y touche. `null` = aucun onglet, ce qui ne peut
 * arriver qu'à un compte sans capacité connue (fail closed de `capabilitiesOf`).
 *
 * `counterparts` a une valeur par défaut parce que les écrans d'authentification appellent cette
 * fonction AVANT d'avoir pu demander quoi que ce soit — et « pas demandé » se répond comme « pas
 * encore su ». Sans conséquence tant qu'aucun onglet conditionnel n'est en tête de table :
 * `dashboard` et `planning` y sont, et aucun des deux ne dépend d'un interlocuteur. Le jour où
 * l'un d'eux bougerait, ces appels-là devraient passer le vrai signal.
 */
export function landingTab(
  capabilities: CapabilityFlags,
  counterparts: CounterpartsDto = UNKNOWN_COUNTERPARTS,
): Href | null {
  const first = visibleTabs(capabilities, counterparts)[0];
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
export function redirectForPath(
  pathname: string,
  capabilities: CapabilityFlags,
  counterparts: CounterpartsDto,
): Href | null {
  const current = TABS.find(
    (tab) => pathname === `/${tab.name}` || pathname.startsWith(`/${tab.name}/`),
  );
  // Sur la CAPACITÉ seulement, jamais sur la contrepartie : rester sur un onglet Messages devenu
  // sans objet montre un état vide qui s'explique, là où une redirection déplacerait l'écran sous
  // les doigts de quelqu'un dont le dernier athlète vient de partir. La capacité, elle, donne un
  // 403 — il n'y a rien à y laisser voir.
  if (current == null || isGranted(current, capabilities)) return null;
  return landingTab(capabilities, counterparts);
}
