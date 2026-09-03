import type { CapabilityName, CounterpartsDto } from "@cmv/shared";
import type { IconType } from "react-icons";
import {
  IoBarbellOutline,
  IoCalendarOutline,
  IoChatbubbleOutline,
  IoCheckboxOutline,
  IoGridOutline,
  IoLibraryOutline,
  IoNotificationsOutline,
  IoPersonOutline,
  IoReceiptOutline,
} from "react-icons/io5";

/**
 * La navigation web, décrite comme une donnée — consommée par `CmvAppShell` (qui la rend) et par
 * `useActiveSpace` (qui en déduit l'espace courant). Une seule table, donc le basculeur ne peut
 * pas désigner un espace que la nav ne sait pas afficher.
 *
 * Elle vit dans `shared/lib/` et non dans le composant, pour la même raison que `tabs.ts` côté
 * mobile : deux consommateurs, dont un hook.
 *
 * Chaque entrée porte la capacité qui la rend visible — la MÊME que celle exigée par la route
 * correspondante (`CmvRoleGate`). C'est ce qui empêche la dérive dont ce projet a déjà
 * l'expérience : une nav qui propose ce que la route refuse.
 *
 * **La capacité ne suffit plus depuis #198** : la messagerie dépend AUSSI d'une relation. Un compte
 * qui se coache seul porte les deux capacités et n'a pourtant personne à qui écrire — l'entrée
 * s'affichait, et menait à une liste dont la seule ligne était lui-même. La visibilité se lit donc
 * en deux temps : la capacité dit à quel espace une entrée appartient, `requiresCounterpart` dit
 * qu'elle n'a d'objet qu'avec quelqu'un en face.
 *
 * La moitié de l'invariant qui SAUTE est donc « la nav ne cache rien d'accessible » : `/messages`
 * reste atteignable par son URL quand la nav ne la propose plus, et c'est voulu — la garde est
 * l'API, jamais la nav. Celle qui tient toujours, et qui compte, est l'inverse : la nav ne propose
 * jamais ce que la route refuse.
 *
 * Pas d'entrée « Athlètes » : la liste vit dans le tableau de bord depuis #113.
 */
export type NavItem = {
  to: string;
  labelKey: string;
  icon: IconType;
  capability: CapabilityName;
  /**
   * L'entrée n'a d'objet qu'avec un interlocuteur DANS CET ESPACE. Absent = elle ne dépend que de
   * la capacité, comme toutes les autres.
   */
  requiresCounterpart?: true;
};

export const NAV_ITEMS: readonly NavItem[] = [
  // En TÊTE de chaque espace : c'est aussi ce qui en fait la destination du basculeur,
  // `landingPath` prenant la première entrée de l'espace visé.
  { to: "/", labelKey: "nav.dashboard", icon: IoGridOutline, capability: "coach" },
  { to: "/library", labelKey: "nav.library", icon: IoLibraryOutline, capability: "coach" },
  { to: "/plans", labelKey: "nav.plans", icon: IoCalendarOutline, capability: "coach" },
  { to: "/feedbacks", labelKey: "nav.feedbacks", icon: IoCheckboxOutline, capability: "coach" },
  {
    to: "/messages",
    labelKey: "nav.messages",
    icon: IoChatbubbleOutline,
    capability: "coach",
    requiresCounterpart: true,
  },
  { to: "/invoices", labelKey: "nav.invoices", icon: IoReceiptOutline, capability: "coach" },
  {
    to: "/reminders",
    labelKey: "nav.reminders",
    icon: IoNotificationsOutline,
    capability: "coach",
  },
  { to: "/planning", labelKey: "nav.planning", icon: IoCalendarOutline, capability: "athlete" },
  { to: "/sessions", labelKey: "nav.sessions", icon: IoBarbellOutline, capability: "athlete" },
  {
    to: "/messages",
    labelKey: "nav.myMessages",
    icon: IoChatbubbleOutline,
    capability: "athlete",
    requiresCounterpart: true,
  },
  { to: "/invoices", labelKey: "nav.myInvoices", icon: IoReceiptOutline, capability: "athlete" },
  { to: "/my-coach", labelKey: "nav.myCoach", icon: IoPersonOutline, capability: "athlete" },
];

/**
 * Les deux routes servies aux DEUX capacités. Elles seules portent `?as=` : c'est ce qui les rend
 * distinctes entre les deux espaces, et ce que l'API exige d'un compte cumulant (#10).
 */
export const SHARED_ROUTES = new Set(["/invoices", "/messages"]);

/**
 * Ce qu'on répond tant que les contreparties ne sont pas chargées : « il y en a des deux côtés ».
 *
 * Permissif, et il DOIT l'être : « pas encore su » ne vaut jamais « absent ». Une entrée qui
 * clignote à l'apparition se remarque à peine ; une entrée absente le temps d'un aller-retour
 * envoie ailleurs quiconque avait `/messages` en signet.
 */
export const UNKNOWN_COUNTERPARTS: CounterpartsDto = { asCoach: true, asAthlete: true };

/** Y a-t-il quelqu'un en face DANS cet espace ? */
function hasCounterpart(space: CapabilityName, counterparts: CounterpartsDto): boolean {
  return space === "coach" ? counterparts.asCoach : counterparts.asAthlete;
}

/** Les entrées d'un espace, dans l'ordre de la table. */
export function itemsOfSpace(
  space: CapabilityName,
  counterparts: CounterpartsDto,
): readonly NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.capability === space &&
      (item.requiresCounterpart !== true || hasCounterpart(space, counterparts)),
  );
}

/**
 * Où mène le basculeur : la PREMIÈRE entrée de l'espace visé. Dérivé de la table plutôt que codé
 * en dur — le jour où une entrée passe en tête, la destination suit sans qu'on y touche.
 *
 * Les contreparties lui sont passées pour la même raison : le jour où l'entrée de tête devient
 * conditionnelle, le basculeur ne doit pas continuer d'y mener.
 */
export function landingPath(space: CapabilityName, counterparts: CounterpartsDto): string {
  return itemsOfSpace(space, counterparts)[0]?.to ?? "/";
}

/**
 * L'espace auquel appartient un chemin, `null` s'il n'appartient à aucun ou aux deux.
 *
 * Le préfixe et non l'égalité : `/library/exercises/42` est dans l'espace coach comme `/library`.
 * `/` est traité à part — tout chemin commence par lui.
 *
 * Rend `null` pour une route PARTAGÉE : `/invoices` appartient aux deux espaces, et seul `?as=`
 * peut trancher. Confondre les deux cas rangerait un compte à double capacité dans l'espace coach
 * dès qu'il ouvre ses factures d'athlète.
 */
export function spaceOfPath(pathname: string): CapabilityName | null {
  if (SHARED_ROUTES.has(pathname)) return null;
  const match = NAV_ITEMS.find(
    (item) =>
      !SHARED_ROUTES.has(item.to) &&
      (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)),
  );
  return match?.capability ?? null;
}
