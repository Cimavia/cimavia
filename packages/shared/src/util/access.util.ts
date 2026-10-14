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

/** Modifier le contenu : le propriétaire, ou un droit d'Écriture. */
export function canWrite(access: MyAccess): boolean {
  return access.level !== MyAccessLevel.READ;
}
