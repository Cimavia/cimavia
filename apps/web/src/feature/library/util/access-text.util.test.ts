import { AccessLevel, type MyAccess, MyAccessLevel } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { fakeT } from "../../../../test/translator";
import { accessText, myRightText, ownerRightText, ownerText } from "./access-text.util";

const C = { id: "c", name: "C" };
const M = { id: "m", name: "M" };
const F = { id: "org-f", name: "F" };
const G = { id: "org-g", name: "G" };
const OWNER: MyAccess = { level: MyAccessLevel.OWNER, via: null };

describe("accessText", () => {
  it("« Privé » pour ce qui n'est ouvert à personne", () => {
    expect(accessText({ owner: C, myAccess: OWNER, grants: [] }, fakeT)).toBe(
      "library.access.private",
    );
  });

  it("une entrée par entreprise, dans l'ordre que décide accessLabel", () => {
    const grants = [
      { organization: G, level: AccessLevel.READ },
      { organization: F, level: AccessLevel.WRITE },
    ];
    expect(accessText({ owner: C, myAccess: OWNER, grants }, fakeT)).toBe(
      [
        'library.access.grant({"name":"F","level":"library.access.level.WRITE"})',
        'library.access.grant({"name":"G","level":"library.access.level.READ"})',
      ].join(", "),
    );
  });

  it("l'élément d'un autre Coach dit qui le partage et le droit de l'acteur", () => {
    expect(
      accessText(
        { owner: M, myAccess: { level: MyAccessLevel.READ, via: F }, grants: null },
        fakeT,
      ),
    ).toBe('library.access.sharedBy({"owner":"M","level":"library.access.level.READ"})');
  });

  it("un accès qui ne se dit pas rend un tiret, jamais « Privé »", () => {
    expect(accessText({ owner: C, myAccess: OWNER, grants: null }, fakeT)).toBe("—");
  });
});

describe("ownerText", () => {
  it("« Moi » pour ce qui est à l'acteur, le nom de l'autre Coach sinon", () => {
    expect(ownerText({ owner: C, myAccess: OWNER }, fakeT)).toBe("library.access.me");
    expect(ownerText({ owner: M, myAccess: { level: MyAccessLevel.WRITE, via: F } }, fakeT)).toBe(
      "M",
    );
  });
});

describe("ownerRightText", () => {
  it("« Moi » pour ce qui est à l'acteur", () => {
    expect(ownerRightText({ owner: C, myAccess: OWNER }, fakeT)).toBe("library.access.me");
  });

  it("le propriétaire et le droit de l'acteur, sans dire d'où il le tient", () => {
    expect(
      ownerRightText({ owner: M, myAccess: { level: MyAccessLevel.WRITE, via: F } }, fakeT),
    ).toBe('library.access.grant({"name":"M","level":"library.access.level.WRITE"})');
  });
});

describe("myRightText", () => {
  it("le droit et l'entreprise qui le donne", () => {
    expect(myRightText({ level: MyAccessLevel.WRITE, via: F }, fakeT)).toBe(
      'library.access.via({"level":"library.access.level.WRITE","organization":"F"})',
    );
  });

  it("sans provenance, le droit seul", () => {
    expect(myRightText({ level: MyAccessLevel.READ, via: null }, fakeT)).toBe(
      "library.access.level.READ",
    );
  });
});
