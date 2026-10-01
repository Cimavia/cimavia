/**
 * Cet athlète, est-ce MOI ? — le compte courant, quand il se coache lui-même (#14).
 *
 * Comparaison à l'id de SESSION, et non à un drapeau porté par chaque DTO : le cas se présente
 * dans les débriefs, les cycles, la fiche athlète et le tableau de suivi, dont les charges utiles
 * n'ont en commun qu'un `athleteId`. Un marqueur à propager aurait demandé de toucher quatre
 * schémas — et d'y penser au cinquième.
 *
 * `selfId` absent = session non résolue : on ne prétend pas que c'est soi. Fail closed dans le
 * sens qui ne cache rien — au pire un aller-retour de plus, jamais un écran amputé à tort.
 *
 * Écrit une fois pour les deux clients (#505) : chacun lit sa session à sa façon, mais la règle
 * ne doit pas pouvoir diverger.
 */
export function isSelfAthlete(selfId: string | null | undefined, athleteId: string): boolean {
  return selfId != null && athleteId === selfId;
}

/**
 * Comment nommer un athlète dans une liste de coach — son nom, suivi de « (moi) » quand c'est le
 * compte courant.
 *
 * À n'utiliser que pour du TEXTE affiché. Les initiales d'un avatar se calculent sur le nom brut :
 * « Dual Curl (moi) » y produirait un « DC (m) » ou pire. Et une surface qui doit DÉCIDER passe
 * par `isSelfAthlete`, jamais par la présence de « (moi) » dans une chaîne traduite.
 */
export function athleteLabel(
  athleteId: string,
  athleteName: string,
  selfId: string | null | undefined,
  translate: (key: string, values: { name: string }) => string,
): string {
  return isSelfAthlete(selfId, athleteId)
    ? translate("athlete.self", { name: athleteName })
    : athleteName;
}

/** Les deux hooks qu'une app expose, une fois branchés sur sa session et sa traduction. */
export type AthleteLabelHooks = {
  useAthleteLabel: () => (athleteId: string, athleteName: string) => string;
  useIsSelfAthlete: () => (athleteId: string) => boolean;
};

/**
 * Compose les hooks de « (moi) » à partir de ce que chaque app lit à sa façon : l'id de session
 * (`authClient` web ou Expo) et la traduction (son instance i18next). Écrits dans chaque app, ils
 * restaient des copies au mot près une fois la règle sortie — et SonarCloud les comptait (#505).
 *
 * Aucune dépendance à React : ce ne sont que des fonctions qui appellent celles qu'on leur donne.
 * Les noms en `use` disent aux règles des hooks ce qu'elles sont — `useSelfId` et `useTranslate`
 * sont appelés à chaque rendu, dans le même ordre, comme n'importe quel hook.
 */
export function createAthleteLabelHooks(
  useSelfId: () => string | null | undefined,
  useTranslate: () => (key: string, values: { name: string }) => string,
): AthleteLabelHooks {
  function useAthleteLabel() {
    const translate = useTranslate();
    const selfId = useSelfId();
    return (athleteId: string, athleteName: string) =>
      athleteLabel(athleteId, athleteName, selfId, translate);
  }

  function useIsSelfAthlete() {
    const selfId = useSelfId();
    return (athleteId: string) => isSelfAthlete(selfId, athleteId);
  }

  return { useAthleteLabel, useIsSelfAthlete };
}
