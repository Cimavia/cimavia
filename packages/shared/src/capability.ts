/**
 * Ce qu'un compte a le droit de faire — indépendamment de la plateforme où il le fait.
 *
 * POURQUOI cette fonction plutôt qu'une lecture recopiée dans chaque écran : elle est le **seul**
 * endroit qui dérive un droit de la session. Les gardes d'écran, la navigation et le routage des
 * notifications consomment son résultat. C'est ce qui a permis à #9 de remplacer le rôle exclusif
 * par deux capacités sans toucher un seul de ses appelants.
 *
 * `isCoach` et `isAthlete` sont **cumulables et indépendants** (#7) : un coach qui se coache
 * lui-même les porte tous les deux. Ne jamais traiter l'un comme la négation de l'autre.
 *
 * `isCompany` est **exclusif** des deux autres (#600) : un compte Entreprise ne coache ni ne
 * s'entraîne. La base le garantit par un CHECK ; ce type ne le suppose pas pour autant — chaque
 * drapeau se lit pour lui-même.
 */
export type Capabilities = {
  isCoach: boolean;
  isAthlete: boolean;
  isCompany: boolean;
};

/**
 * Le nom d'une capacité, tel qu'une route ou une entrée de navigation l'exige — la forme sous
 * laquelle une exigence s'ÉCRIT (`capability="coach"`), là où `Capabilities` est ce qu'un compte
 * POSSÈDE.
 */
export type CapabilityName = "coach" | "athlete" | "company";

/**
 * Les deux capacités d'ENTRAÎNEMENT — celles qui se cumulent, se cochent à l'inscription, et qu'un
 * compte à double capacité précise par `?as=` sur les routes servies aux deux (#10).
 *
 * Un type à part et non `CapabilityName` partout (#600) : le code qui les départage s'écrit en
 * ternaire, `as === "coach" ? … : …`. Élargi à `"company"`, chacun de ces ternaires rangeait
 * l'entreprise dans la branche athlète, sans rien qui le signale. Restreint ici, il ne compile pas.
 */
export type TrainingCapability = Exclude<CapabilityName, "company">;

/**
 * Traduit une exigence en réponse. Une seule table de correspondance pour tous les consommateurs
 * (garde de route, sidebar web, onglets mobile) : sans elle, chacun réécrit le même ternaire, et le
 * jour où une troisième capacité existe il faut les retrouver tous.
 *
 * Un `switch` exhaustif et non plus un ternaire : c'est ici que la troisième est arrivée (#600), et
 * le ternaire répondait `isAthlete` à la question « est-ce une entreprise ? ».
 */
export function hasCapability(capabilities: Capabilities, name: CapabilityName): boolean {
  switch (name) {
    case "coach":
      return capabilities.isCoach;
    case "athlete":
      return capabilities.isAthlete;
    case "company":
      return capabilities.isCompany;
  }
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
  isCompany?: boolean | null | undefined;
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
  return {
    isCoach: user?.isCoach === true,
    isAthlete: user?.isAthlete === true,
    isCompany: user?.isCompany === true,
  };
}

/**
 * Les capacités proposées à l'inscription, dans l'ordre d'affichage, avec la clé i18n de leur
 * libellé. Partagée parce que les deux écrans d'inscription la déclaraient à l'identique : deux
 * listes, c'est un jour où l'une en propose trois et l'autre deux.
 *
 * Elles sont **cumulables** (#7) : un coach qui se coache lui-même coche les deux. `role` n'est
 * plus envoyé — l'API le déduit comme persona d'atterrissage (#12).
 */
export const SELECTABLE_CAPABILITIES: readonly { name: TrainingCapability; labelKey: string }[] = [
  { name: "coach", labelKey: "auth.register.capabilityCoach" },
  { name: "athlete", labelKey: "auth.register.capabilityAthlete" },
];

/**
 * Bascule une capacité sans muter l'ensemble existant : React compare par référence, et une
 * mutation en place ne redessinerait rien.
 */
export function toggledCapability(
  current: ReadonlySet<TrainingCapability>,
  name: TrainingCapability,
): Set<TrainingCapability> {
  const next = new Set(current);
  if (!next.delete(name)) next.add(name);
  return next;
}

/**
 * Le PREMIER choix de l'inscription (#600, maquette #595) : un compte qui coache et/ou s'entraîne,
 * ou un compte Entreprise. Exclusifs — c'est ce qui fait de l'entreprise un type de compte et non
 * une troisième case à cocher.
 */
export type AccountType = "training" | "company";

/**
 * Les deux cartes de l'inscription, dans l'ordre d'affichage. Le libellé du champ nom en dépend :
 * « Nom complet » pour une personne, « Nom de l'entreprise » pour une entreprise — qui n'a pas
 * d'autre nom que celui de son compte. Partagée pour la même raison que `SELECTABLE_CAPABILITIES`.
 */
export const ACCOUNT_TYPES: readonly {
  type: AccountType;
  labelKey: string;
  hintKey: string;
  nameLabelKey: string;
}[] = [
  {
    type: "training",
    labelKey: "auth.register.type.training",
    hintKey: "auth.register.type.trainingHint",
    nameLabelKey: "auth.register.name",
  },
  {
    type: "company",
    labelKey: "auth.register.type.company",
    hintKey: "auth.register.type.companyHint",
    nameLabelKey: "auth.register.companyName",
  },
];

/**
 * Ce que l'inscription envoie, ou `null` quand elle ne doit pas partir : « Coach et/ou athlète »
 * sans aucune case cochée. Les cases ne valent que sous ce type — une entreprise qui les aurait
 * cochées avant de changer de carte n'envoie qu'`isCompany`, que l'API exige seul.
 */
export function signUpCapabilities(
  type: AccountType,
  selected: ReadonlySet<TrainingCapability>,
): Capabilities | null {
  if (type === "company") return { isCoach: false, isAthlete: false, isCompany: true };
  if (selected.size === 0) return null;
  return { isCoach: selected.has("coach"), isAthlete: selected.has("athlete"), isCompany: false };
}
