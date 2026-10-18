import {
  type AccessGrantDto,
  AccessLevel,
  type AccessOwner,
  type CoachGrantDto,
  type MyAccess,
  MyAccessLevel,
  type OrganizationAccessLevel,
} from "../dto/access.schema";

/** Ce qu'il faut d'un exercice, d'une séance ou d'un cycle pour dire son accès. */
export type AccessLabelSubject = {
  owner: AccessOwner;
  myAccess: MyAccess;
  grants: readonly AccessGrantDto[] | null;
  coachGrants: readonly CoachGrantDto[] | null;
};

/**
 * La colonne Accès d'une ligne de la bibliothèque (#606, maquette #597 frames 1 et 6), avant
 * traduction :
 *
 * - `private` — l'élément de l'acteur, ouvert à personne : « Privé » ;
 * - `granted` — l'élément de l'acteur, et à qui il l'ouvre : « F · Lecture, M · Écriture » ;
 * - `sharedBy` — l'élément d'un autre Coach, et le droit de l'acteur : « Partagé par M · Lecture ».
 */
export type AccessLabel =
  | { kind: "private" }
  | { kind: "granted"; grants: readonly { name: string; level: AccessLevel }[] }
  | { kind: "sharedBy"; owner: string; level: OrganizationAccessLevel };

/**
 * L'accès d'un élément tel que la colonne le dit, ou `null` s'il ne se dit pas : le propriétaire
 * reçoit toujours ses droits, leur absence est une réponse incomplète, pas un élément privé (règle
 * dure n°5).
 *
 * Les entreprises d'abord, puis les Coachs (#608), chacun trié par nom : la cellule ne doit pas
 * changer d'ordre d'une lecture à l'autre. Une ligne Coach « Aucun » se dit quand une entreprise
 * ouvre l'élément — « F · Écriture, M · Aucun » : sans elle, la cellule laisserait croire que M
 * écrit. Sans entreprise ouverte, elle ne ferme rien, et ne se dit pas (tranché en #608).
 */
export function accessLabel(subject: AccessLabelSubject): AccessLabel | null {
  const { level } = subject.myAccess;
  if (level !== MyAccessLevel.OWNER) {
    return { kind: "sharedBy", owner: subject.owner.name, level };
  }
  if (subject.grants == null || subject.coachGrants == null) return null;
  const organizations: Beneficiary[] = subject.grants.map((grant) => ({
    ...grant.organization,
    level: grant.level,
  }));
  const coaches = subject.coachGrants
    .filter((grant) => organizations.length > 0 || grant.level !== AccessLevel.NONE)
    .map((grant) => ({ ...grant.coach, level: grant.level }));
  if (organizations.length + coaches.length === 0) return { kind: "private" };
  return {
    kind: "granted",
    grants: [...byName(organizations), ...byName(coaches)].map(({ name, level }) => ({
      name,
      level,
    })),
  };
}

type Beneficiary = { id: string; name: string; level: AccessLevel };

/** Par nom, l'identifiant départageant deux homonymes. */
function byName(beneficiaries: readonly Beneficiary[]): Beneficiary[] {
  return [...beneficiaries].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
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
