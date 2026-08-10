import { Role } from "./role";

/**
 * Ce qu'un compte a le droit de faire — indépendamment de la plateforme où il le fait.
 *
 * POURQUOI cette fonction plutôt qu'un `role === Role.COACH` recopié dans chaque écran : elle est
 * le **seul** endroit qui lise `role` pour en déduire un droit. Les gardes d'écran, la navigation
 * et le routage des notifications consomment son résultat, jamais le rôle. C'est tout l'intérêt :
 * le jour où [#9/#10](https://github.com/Cimavia/cimavia/issues/9) remplacent le rôle exclusif par
 * deux colonnes `isCoach`/`isAthlete` sur `User`, **seul le corps de cette fonction change** — pas
 * un seul de ses appelants.
 *
 * Aujourd'hui `role` est exclusif, donc au plus une capacité est vraie à la fois. Le modèle cible
 * les rend **cumulables** (un coach qui se coache lui-même, cf. #7) : les appelants doivent donc
 * traiter les deux drapeaux comme indépendants dès maintenant, jamais l'un comme la négation de
 * l'autre.
 */
export type Capabilities = {
  isCoach: boolean;
  isAthlete: boolean;
};

/**
 * Le nom d'une capacité, tel qu'une route ou une entrée de navigation l'exige — la forme sous
 * laquelle une exigence s'ÉCRIT (`capability="coach"`), là où `Capabilities` est ce qu'un compte
 * POSSÈDE.
 */
export type CapabilityName = "coach" | "athlete";

/**
 * Traduit une exigence en réponse. Une seule table de correspondance pour tous les consommateurs
 * (garde de route, sidebar web, onglets mobile) : sans elle, chacun réécrit le même ternaire, et le
 * jour où une troisième capacité existe il faut les retrouver tous.
 */
export function hasCapability(capabilities: Capabilities, name: CapabilityName): boolean {
  return name === "coach" ? capabilities.isCoach : capabilities.isAthlete;
}

/**
 * Le strict nécessaire pour décider. `role` est typé `string` et non `RoleType` : Better Auth le
 * remonte en `additionalFields`, donc en scalaire non contraint côté client — le narrowing, c'est
 * cette fonction qui le fait, pas ses appelants.
 */
export type CapabilitySource = { role: string };

/**
 * `null`/`undefined` (session en cours de chargement, ou absente) et rôle inconnu rendent la même
 * chose : **aucune capacité**. Fail closed — un rôle qu'on ne comprend pas n'ouvre rien.
 *
 * Le cas « rôle inconnu » n'est pas théorique : `Role.ADMIN` existe déjà dans l'enum (#3, jamais
 * attribué à ce jour), et une API plus récente qu'un client déployé peut lui envoyer une valeur
 * qu'il ne connaît pas encore.
 */
export function capabilitiesOf(user: CapabilitySource | null | undefined): Capabilities {
  switch (user?.role) {
    case Role.COACH:
      return { isCoach: true, isAthlete: false };
    case Role.ATHLETE:
      return { isCoach: false, isAthlete: true };
    default:
      return { isCoach: false, isAthlete: false };
  }
}
