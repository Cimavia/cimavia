import { describe, expect, it } from "vitest";
import {
  type AccessGrantDto,
  AccessLevel,
  type CoachGrantDto,
  type MyAccess,
  MyAccessLevel,
} from "../dto/access.schema";
import { accessLabel, matchesTagFilter, sessionTags } from "./library-row.util";

const F = { id: "org-f", name: "F" };
const G = { id: "org-g", name: "G" };
const C = { id: "c", name: "C" };
const M = { id: "m", name: "M" };

const OWNER: MyAccess = { level: MyAccessLevel.OWNER, via: null };

describe("accessLabel", () => {
  it("l'élément de l'acteur ouvert à personne est privé", () => {
    expect(accessLabel({ owner: C, myAccess: OWNER, grants: [], coachGrants: [] })).toEqual({
      kind: "private",
    });
  });

  it("l'élément de l'acteur dit à qui il l'ouvre, entreprises triées par nom", () => {
    const grants: AccessGrantDto[] = [
      { organization: G, level: AccessLevel.READ },
      { organization: F, level: AccessLevel.WRITE },
    ];
    expect(accessLabel({ owner: C, myAccess: OWNER, grants, coachGrants: [] })).toEqual({
      kind: "granted",
      grants: [
        { name: "F", level: AccessLevel.WRITE },
        { name: "G", level: AccessLevel.READ },
      ],
    });
  });

  it("à nom égal, l'identifiant départage : l'ordre ne dépend pas de la réponse", () => {
    const twin = { id: "org-0", name: "F" };
    const grants: AccessGrantDto[] = [
      { organization: F, level: AccessLevel.READ },
      { organization: twin, level: AccessLevel.WRITE },
    ];
    expect(accessLabel({ owner: C, myAccess: OWNER, grants, coachGrants: [] })).toEqual({
      kind: "granted",
      grants: [
        { name: "F", level: AccessLevel.WRITE },
        { name: "F", level: AccessLevel.READ },
      ],
    });
  });

  it("ne réordonne pas les droits reçus", () => {
    const grants: AccessGrantDto[] = [
      { organization: G, level: AccessLevel.READ },
      { organization: F, level: AccessLevel.WRITE },
    ];
    accessLabel({ owner: C, myAccess: OWNER, grants, coachGrants: [] });
    expect(grants.map((grant) => grant.organization.id)).toEqual(["org-g", "org-f"]);
  });

  it("sans droits rendus, le propriétaire n'apprend rien : null, pas « Privé »", () => {
    expect(accessLabel({ owner: C, myAccess: OWNER, grants: null, coachGrants: [] })).toBeNull();
  });

  it("sans droits Coach rendus non plus : null", () => {
    expect(accessLabel({ owner: C, myAccess: OWNER, grants: [], coachGrants: null })).toBeNull();
  });

  describe("les lignes d'un Coach (#608)", () => {
    const B = { id: "b", name: "B" };
    const coach = (who: typeof M, level: CoachGrantDto["level"]): CoachGrantDto => ({
      coach: who,
      level,
    });
    const label = (grants: AccessGrantDto[], coachGrants: CoachGrantDto[]) =>
      accessLabel({ owner: C, myAccess: OWNER, grants, coachGrants });

    it("viennent après les entreprises, triées par nom (frame 6)", () => {
      expect(
        label(
          [{ organization: F, level: AccessLevel.READ }],
          [coach(M, AccessLevel.WRITE), coach(B, AccessLevel.READ)],
        ),
      ).toEqual({
        kind: "granted",
        grants: [
          { name: "F", level: AccessLevel.READ },
          { name: "B", level: AccessLevel.READ },
          { name: "M", level: AccessLevel.WRITE },
        ],
      });
    });

    it("« Aucun » se dit quand une entreprise ouvre l'élément", () => {
      expect(
        label([{ organization: F, level: AccessLevel.WRITE }], [coach(M, AccessLevel.NONE)]),
      ).toEqual({
        kind: "granted",
        grants: [
          { name: "F", level: AccessLevel.WRITE },
          { name: "M", level: AccessLevel.NONE },
        ],
      });
    });

    it("« Aucun » sans entreprise ouverte ne ferme rien : l'élément reste privé", () => {
      expect(label([], [coach(M, AccessLevel.NONE)])).toEqual({ kind: "private" });
    });

    it("une ligne ouverte suffit à ne plus être privé", () => {
      expect(label([], [coach(M, AccessLevel.READ)])).toEqual({
        kind: "granted",
        grants: [{ name: "M", level: AccessLevel.READ }],
      });
    });
  });

  it.each([
    MyAccessLevel.READ,
    MyAccessLevel.WRITE,
  ] as const)("l'élément d'un autre Coach dit qui le partage, et le droit %s de l'acteur", (level) => {
    expect(
      accessLabel({ owner: M, myAccess: { level, via: F }, grants: null, coachGrants: null }),
    ).toEqual({
      kind: "sharedBy",
      owner: "M",
      level,
    });
  });
});

describe("sessionTags", () => {
  it("réunit les tags des exercices sans doublon, dans l'ordre de la composition", () => {
    expect(
      sessionTags([{ tags: ["renfo"] }, { tags: ["grimpe", "renfo"] }, { tags: ["technique"] }]),
    ).toEqual(["renfo", "grimpe", "technique"]);
  });

  it("aucun exercice tagué, ou aucun exercice : liste vide", () => {
    expect(sessionTags([{ tags: [] }, { tags: [] }])).toEqual([]);
    expect(sessionTags([])).toEqual([]);
  });
});

describe("matchesTagFilter", () => {
  it("sans tag choisi, tout passe — même ce qui n'a aucun tag", () => {
    expect(matchesTagFilter(["force"], [])).toBe(true);
    expect(matchesTagFilter([], [])).toBe(true);
  });

  it("passe dès qu'il porte UN des tags choisis : le filtre élargit", () => {
    expect(matchesTagFilter(["force"], ["force", "gainage"])).toBe(true);
    expect(matchesTagFilter(["gainage", "mobilité"], ["force", "gainage"])).toBe(true);
  });

  it("écarte ce qui n'en porte aucun, et ce qui n'a pas de tag", () => {
    expect(matchesTagFilter(["mobilité"], ["force", "gainage"])).toBe(false);
    expect(matchesTagFilter([], ["force"])).toBe(false);
  });
});
