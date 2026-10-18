import { describe, expect, it } from "vitest";
import {
  type AccessGrantDto,
  AccessLevel,
  type CoachGrantDto,
  MyAccessLevel,
} from "../dto/access.schema";
import { canWrite, effectiveAccess, foreignOf, isOwner, sharedRight } from "./access.util";

const F = { id: "org-f", name: "F" };
const G = { id: "org-g", name: "G" };
const A = { id: "org-a", name: "A" };

const grant = (
  organization: AccessGrantDto["organization"],
  level: AccessGrantDto["level"],
): AccessGrantDto => ({ organization, level });

const subject = (
  grants: AccessGrantDto[],
  actorOrganizationIds: string[],
  actorId = "m",
  coachGrants: CoachGrantDto[] = [],
) => ({
  ownerId: "c",
  actorId,
  grants,
  coachGrants,
  actorOrganizationIds: new Set(actorOrganizationIds),
});

const line = (id: string, level: CoachGrantDto["level"]): CoachGrantDto => ({
  coach: { id, name: id.toUpperCase() },
  level,
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

describe("effectiveAccess — la ligne d'un Coach (#608)", () => {
  const inF = (coachGrants: CoachGrantDto[], grants = [grant(F, AccessLevel.WRITE)]) =>
    effectiveAccess(subject(grants, ["org-f"], "m", coachGrants));

  it("NONE ferme ce que son entreprise ouvre", () => {
    expect(inF([line("m", AccessLevel.NONE)])).toBeNull();
  });

  it.each([
    [AccessLevel.READ, MyAccessLevel.READ],
    [AccessLevel.WRITE, MyAccessLevel.WRITE],
  ] as const)("une ligne %s l'emporte, sans provenance", (level, expected) => {
    expect(inF([line("m", level)], [grant(F, AccessLevel.READ)])).toEqual({
      level: expected,
      via: null,
    });
  });

  it("baisser n'est pas élargir : F en Écriture, M en Lecture → Lecture", () => {
    expect(inF([line("m", AccessLevel.READ)])?.level).toBe(MyAccessLevel.READ);
  });

  it("ouvre aussi sans aucun droit d'entreprise", () => {
    expect(inF([line("m", AccessLevel.WRITE)], [])).toEqual({
      level: MyAccessLevel.WRITE,
      via: null,
    });
  });

  it("la ligne d'un autre Coach ne dit rien de l'acteur", () => {
    expect(inF([line("b", AccessLevel.NONE)])).toEqual({ level: MyAccessLevel.WRITE, via: F });
  });

  it("le propriétaire n'est soumis à aucune ligne", () => {
    expect(effectiveAccess(subject([], [], "c", [line("c", AccessLevel.NONE)]))).toEqual({
      level: MyAccessLevel.OWNER,
      via: null,
    });
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

describe("foreignOf", () => {
  const of = (level: MyAccessLevel) => ({ id: "e", myAccess: { level, via: null } });

  it("rend l'élément d'un autre, en Lecture comme en Écriture", () => {
    const read = of(MyAccessLevel.READ);
    const write = of(MyAccessLevel.WRITE);
    expect(foreignOf(read)).toBe(read);
    expect(foreignOf(write)).toBe(write);
  });

  it("`null` pour le sien, et pour celui qui naît", () => {
    expect(foreignOf(of(MyAccessLevel.OWNER))).toBeNull();
    expect(foreignOf(null)).toBeNull();
  });
});

describe("sharedRight", () => {
  it("dit le droit tenu sur ce qui est à un autre, et l'entreprise qui le donne", () => {
    expect(sharedRight({ level: MyAccessLevel.READ, via: F })).toEqual({
      level: MyAccessLevel.READ,
      via: F,
    });
    expect(sharedRight({ level: MyAccessLevel.WRITE, via: null })).toEqual({
      level: MyAccessLevel.WRITE,
      via: null,
    });
  });

  it("`null` sur le sien, et pour l'athlète, qui n'a pas de droit", () => {
    expect(sharedRight({ level: MyAccessLevel.OWNER, via: null })).toBeNull();
    expect(sharedRight(null)).toBeNull();
  });
});
