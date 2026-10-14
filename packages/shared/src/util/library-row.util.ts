import {
  type AccessGrantDto,
  type AccessOwner,
  type MyAccess,
  MyAccessLevel,
  type OrganizationAccessLevel,
} from "../dto/access.schema";

/** Ce qu'il faut d'un exercice ou d'une séance pour dire son accès. */
export type AccessLabelSubject = {
  owner: AccessOwner;
  myAccess: MyAccess;
  grants: readonly AccessGrantDto[] | null;
};

/**
 * La colonne Accès d'une ligne de la bibliothèque (#606, maquette #597 frame 1), avant traduction :
 *
 * - `private` — l'élément de l'acteur, ouvert à personne : « Privé » ;
 * - `granted` — l'élément de l'acteur, et à qui il l'ouvre : « F · Écriture, G · Lecture » ;
 * - `sharedBy` — l'élément d'un autre Coach, et le droit de l'acteur : « Partagé par M · Lecture ».
 *
 * Les lignes d'un Coach (« M · Écriture ») arrivent avec #608.
 */
export type AccessLabel =
  | { kind: "private" }
  | {
      kind: "granted";
      grants: readonly { name: string; level: OrganizationAccessLevel }[];
    }
  | { kind: "sharedBy"; owner: string; level: OrganizationAccessLevel };

/**
 * L'accès d'un élément tel que la colonne le dit, ou `null` s'il ne se dit pas : le propriétaire
 * reçoit toujours ses droits (`grants`), leur absence est une réponse incomplète, pas un élément
 * privé (règle dure n°5). Les entreprises sont triées par nom : la cellule ne doit pas changer
 * d'ordre d'une lecture à l'autre.
 */
export function accessLabel(subject: AccessLabelSubject): AccessLabel | null {
  const { level } = subject.myAccess;
  if (level !== MyAccessLevel.OWNER) {
    return { kind: "sharedBy", owner: subject.owner.name, level };
  }
  if (subject.grants == null) return null;
  if (subject.grants.length === 0) return { kind: "private" };
  return {
    kind: "granted",
    grants: [...subject.grants]
      .sort(
        (a, b) =>
          a.organization.name.localeCompare(b.organization.name) ||
          a.organization.id.localeCompare(b.organization.id),
      )
      .map((grant) => ({ name: grant.organization.name, level: grant.level })),
  };
}

/**
 * Les tags d'une séance : ceux de ses exercices, réunis sans doublon, dans l'ordre où la
 * composition les rencontre (tranché en #597). `Session` n'a pas de tags à elle : en saisir à part
 * en ferait une seconde source qui dériverait. Liste vide = aucun exercice n'en a, que la ligne
 * rend « — ».
 */
export function sessionTags(exercises: readonly { tags: readonly string[] }[]): string[] {
  return [...new Set(exercises.flatMap((exercise) => exercise.tags))];
}
