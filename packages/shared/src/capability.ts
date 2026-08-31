/**
 * Ce qu'un compte a le droit de faire — indépendamment de la plateforme où il le fait.
 *
 * POURQUOI cette fonction plutôt qu'une lecture recopiée dans chaque écran : elle est le **seul**
 * endroit qui dérive un droit de la session. Les gardes d'écran, la navigation et le routage des
 * notifications consomment son résultat. C'est ce qui a permis à #9 de remplacer le rôle exclusif
 * par deux capacités sans toucher un seul de ses appelants.
 *
 * Les deux drapeaux sont **cumulables et indépendants** (#7) : un coach qui se coache lui-même les
 * porte tous les deux. Ne jamais traiter l'un comme la négation de l'autre.
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
 * Le strict nécessaire pour décider. Les trois formes d'absence sont acceptées — champ omis, `null`
 * et `undefined` — parce que c'est exactement ce que la session remonte : déclarées `required:
 * false` en `additionalFields`, Better Auth les type `boolean | null | undefined`. Les refuser
 * n'aurait pas rendu la donnée plus sûre, seulement forcé un cast à l'appel.
 *
 * `role` n'y figure **pas**, et c'est le cœur de #9 : il survit sur `User` comme persona
 * d'affichage — sur quel univers atterrit un compte à double capacité — et ne fonde plus aucun
 * droit. Une colonne, un seul sens. Le laisser ici rouvrirait la seconde lecture qu'on vient de
 * fermer.
 */
export type CapabilitySource = {
  isCoach?: boolean | null | undefined;
  isAthlete?: boolean | null | undefined;
};

/**
 * `null`/`undefined` (session en cours de chargement, ou absente) et capacité absente rendent la
 * même chose : **aucune capacité**. Fail closed — ce qu'on ne comprend pas n'ouvre rien.
 *
 * D'où le `=== true` plutôt qu'un `?? false` : la valeur traverse une frontière HTTP non typée, et
 * seul un booléen vrai ouvre quoi que ce soit. Une chaîne `"false"`, un `1`, un champ qu'un client
 * plus ancien n'a pas déclaré — tout cela ferme.
 */
export function capabilitiesOf(user: CapabilitySource | null | undefined): Capabilities {
  return { isCoach: user?.isCoach === true, isAthlete: user?.isAthlete === true };
}
