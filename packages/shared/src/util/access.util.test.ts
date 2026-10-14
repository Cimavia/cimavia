import { describe, expect, it } from "vitest";
import { type AccessGrantDto, AccessLevel, MyAccessLevel } from "../dto/access.schema";
import { canWrite, effectiveAccess, isOwner } from "./access.util";

const F = { id: "org-f", name: "F" };
const G = { id: "org-g", name: "G" };
const A = { id: "org-a", name: "A" };

const grant = (
  organization: AccessGrantDto["organization"],
  level: AccessGrantDto["level"],
): AccessGrantDto => ({ organization, level });

const subject = (grants: AccessGrantDto[], actorOrganizationIds: string[], actorId = "m") => ({
  ownerId: "c",
  actorId,
  grants,
  actorOrganizationIds: new Set(actorOrganizationIds),
});

describe("effectiveAccess", () => {
  it("le propriétaire a tout, sans provenance, même sans aucun droit écrit", () => {
    expect(effectiveAccess(subject([], [], "c"))).toEqual({
      level: MyAccessLevel.OWNER,
      via: null,
    });
  });

  it("un Coach sans droit n'a aucun accès : null, pas un niveau par défaut", () => {
    expect(effectiveAccess(subject([], ["org-f"]))).toBeNull();
  });

  it("un droit accordé à une entreprise dont l'acteur n'est pas membre ne lui ouvre rien", () => {
    expect(effectiveAccess(subject([grant(F, AccessLevel.WRITE)], ["org-g"]))).toBeNull();
  });

  it.each([
    [AccessLevel.READ, MyAccessLevel.READ],
    [AccessLevel.WRITE, MyAccessLevel.WRITE],
  ] as const)("une entreprise en %s ouvre %s, via elle", (level, expected) => {
    expect(effectiveAccess(subject([grant(F, level)], ["org-f"]))).toEqual({
      level: expected,
      via: F,
    });
  });

  it("deux entreprises : la plus large l'emporte, quel que soit l'ordre des lignes", () => {
    const grants = [grant(F, AccessLevel.READ), grant(G, AccessLevel.WRITE)];
    expect(effectiveAccess(subject(grants, ["org-f", "org-g"]))).toEqual({
      level: MyAccessLevel.WRITE,
      via: G,
    });
    expect(effectiveAccess(subject([...grants].reverse(), ["org-f", "org-g"]))).toEqual({
      level: MyAccessLevel.WRITE,
      via: G,
    });
  });

  it("à niveau égal, la provenance est la première entreprise par nom", () => {
    const grants = [grant(F, AccessLevel.READ), grant(A, AccessLevel.READ)];
    expect(effectiveAccess(subject(grants, ["org-f", "org-a"]))?.via).toEqual(A);
  });

  it("à nom égal, l'identifiant départage", () => {
    const twin = { id: "org-0", name: "F" };
    const grants = [grant(F, AccessLevel.READ), grant(twin, AccessLevel.READ)];
    expect(effectiveAccess(subject(grants, ["org-f", "org-0"]))?.via).toEqual(twin);
  });
});

describe("canWrite", () => {
  it.each([
    [MyAccessLevel.OWNER, true],
    [MyAccessLevel.WRITE, true],
    [MyAccessLevel.READ, false],
  ] as const)("%s → %s", (level, expected) => {
    expect(canWrite({ level, via: null })).toBe(expected);
  });
});

describe("isOwner", () => {
  it.each([
    [MyAccessLevel.OWNER, true],
    [MyAccessLevel.WRITE, false],
    [MyAccessLevel.READ, false],
  ] as const)("%s → %s", (level, expected) => {
    expect(isOwner({ level, via: null })).toBe(expected);
  });
});
