import { describe, expect, it } from "vitest";
import {
  type AccessGrantDto,
  AccessLevel,
  type MyAccess,
  MyAccessLevel,
} from "../dto/access.schema";
import { accessLabel, sessionTags } from "./library-row.util";

const F = { id: "org-f", name: "F" };
const G = { id: "org-g", name: "G" };
const C = { id: "c", name: "C" };
const M = { id: "m", name: "M" };

const OWNER: MyAccess = { level: MyAccessLevel.OWNER, via: null };

describe("accessLabel", () => {
  it("l'élément de l'acteur ouvert à personne est privé", () => {
    expect(accessLabel({ owner: C, myAccess: OWNER, grants: [] })).toEqual({ kind: "private" });
  });

  it("l'élément de l'acteur dit à qui il l'ouvre, entreprises triées par nom", () => {
    const grants: AccessGrantDto[] = [
      { organization: G, level: AccessLevel.READ },
      { organization: F, level: AccessLevel.WRITE },
    ];
    expect(accessLabel({ owner: C, myAccess: OWNER, grants })).toEqual({
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
    expect(accessLabel({ owner: C, myAccess: OWNER, grants })).toEqual({
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
    accessLabel({ owner: C, myAccess: OWNER, grants });
    expect(grants.map((grant) => grant.organization.id)).toEqual(["org-g", "org-f"]);
  });

  it("sans droits rendus, le propriétaire n'apprend rien : null, pas « Privé »", () => {
    expect(accessLabel({ owner: C, myAccess: OWNER, grants: null })).toBeNull();
  });

  it.each([
    MyAccessLevel.READ,
    MyAccessLevel.WRITE,
  ] as const)("l'élément d'un autre Coach dit qui le partage, et le droit %s de l'acteur", (level) => {
    expect(accessLabel({ owner: M, myAccess: { level, via: F }, grants: null })).toEqual({
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
