import {
  type AccessGrantDto,
  AccessLevel,
  type MyAccess,
  MyAccessLevel,
} from "../dto/access.schema";

/** Ce qu'il faut savoir d'un élément et de l'acteur pour dire ce que l'acteur peut en faire. */
export type AccessSubject = {
  ownerId: string;
  actorId: string;
  /** Les droits de l'élément, tous bénéficiaires confondus. */
  grants: readonly AccessGrantDto[];
  /** Les entreprises dont l'acteur est Coach. */
  actorOrganizationIds: ReadonlySet<string>;
};

/**
 * Le droit effectif de l'acteur sur un élément (#605), ou `null` s'il n'en a aucun.
 *
 * Le propriétaire a tout. Sinon, le plus large des droits accordés à ses entreprises : un Coach
 * membre de deux entreprises, l'une en Lecture et l'autre en Écriture, écrit. À niveau égal, `via`
 * nomme la première entreprise par ordre alphabétique, pour que le panneau ne change pas de
 * provenance d'une lecture à l'autre.
 *
 * La ligne d'un Coach, prioritaire sur celle de son entreprise, arrivera avec #608. Le filtre de
 * la couche d'isolation traduit la même règle : les deux doivent rester d'accord.
 */
export function effectiveAccess(subject: AccessSubject): MyAccess | null {
  if (subject.actorId === subject.ownerId) {
    return { level: MyAccessLevel.OWNER, via: null };
  }
  const best = subject.grants
    .filter((grant) => subject.actorOrganizationIds.has(grant.organization.id))
    .sort(
      (a, b) =>
        rank(b.level) - rank(a.level) ||
        a.organization.name.localeCompare(b.organization.name) ||
        a.organization.id.localeCompare(b.organization.id),
    )[0];
  if (best == null) return null;
  return {
    level: best.level === AccessLevel.WRITE ? MyAccessLevel.WRITE : MyAccessLevel.READ,
    via: best.organization,
  };
}

function rank(level: AccessGrantDto["level"]): number {
  return level === AccessLevel.WRITE ? 2 : 1;
}

/** Gérer les accès, supprimer, puiser dans son propre catalogue : le propriétaire seul. */
export function isOwner(access: MyAccess): boolean {
  return access.level === MyAccessLevel.OWNER;
}

/** Le droit que l'acteur tient sur ce qui n'est pas à lui : Lecture ou Écriture, et d'où. */
export type SharedRight = Omit<MyAccess, "level"> & {
  level: typeof MyAccessLevel.READ | typeof MyAccessLevel.WRITE;
};

/**
 * Ce qu'une vue agrégée dit sous ce qui n'est pas à l'acteur (#607) — « Partagé par M · Lecture
 * via F » : le droit qu'il en tient. `null` sur le sien, et pour l'athlète, qui n'a pas de droit :
 * il en est le destinataire. La règle vit ici ; web et mobile n'en font que la traduction.
 */
export function sharedRight(access: MyAccess | null): SharedRight | null {
  if (access == null || access.level === MyAccessLevel.OWNER) return null;
  return { level: access.level, via: access.via };
}

/** L'élément s'il est à un autre que l'acteur ; `null` pour le sien, ou pour celui qui naît. */
export function foreignOf<T extends { myAccess: MyAccess }>(element: T | null): T | null {
  return element != null && !isOwner(element.myAccess) ? element : null;
}

/** Modifier le contenu : le propriétaire, ou un droit d'Écriture. */
export function canWrite(access: MyAccess): boolean {
  return access.level !== MyAccessLevel.READ;
}
