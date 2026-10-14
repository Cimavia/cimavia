import { LibraryScope, MyAccessLevel } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import {
  type AccessRow,
  citationsLosingRead,
  libraryScopeWhere,
  organizationsReadingAfter,
  toAccessView,
  toGrantDtos,
} from "./access.mapper";

const grantRow = (id: string, name: string, level: "NONE" | "READ" | "WRITE") => ({
  level,
  organization: { id, user: { name } },
});

const row = (grants: AccessRow["accessGrants"]): AccessRow => ({
  id: "ex-1",
  coach: { id: "c", name: "Camille" },
  accessGrants: grants,
});

describe("toGrantDtos", () => {
  it("rend les droits d'entreprise triés par nom, puis par id", () => {
    expect(
      toGrantDtos([
        grantRow("org-g", "Grimpe", "WRITE"),
        grantRow("org-b", "Bloc", "READ"),
        grantRow("org-a", "Bloc", "READ"),
      ]),
    ).toEqual([
      { organization: { id: "org-a", name: "Bloc" }, level: "READ" },
      { organization: { id: "org-b", name: "Bloc" }, level: "READ" },
      { organization: { id: "org-g", name: "Grimpe" }, level: "WRITE" },
    ]);
  });

  it("écarte une ligne sans entreprise et un NONE : ce sont des lignes de Coach (#608)", () => {
    expect(
      toGrantDtos([{ level: "WRITE", organization: null }, grantRow("org-f", "F", "NONE")]),
    ).toEqual([]);
  });
});

describe("toAccessView", () => {
  const grants = [grantRow("org-f", "F", "READ")];

  it("le propriétaire voit les droits accordés", () => {
    expect(toAccessView(row(grants), { actorId: "c", organizationIds: new Set() })).toEqual({
      owner: { id: "c", name: "Camille" },
      myAccess: { level: MyAccessLevel.OWNER, via: null },
      grants: [{ organization: { id: "org-f", name: "F" }, level: "READ" }],
    });
  });

  it("un autre lecteur voit son droit et sa provenance, jamais les droits des autres", () => {
    expect(
      toAccessView(row(grants), { actorId: "m", organizationIds: new Set(["org-f"]) }),
    ).toEqual({
      owner: { id: "c", name: "Camille" },
      myAccess: { level: MyAccessLevel.READ, via: { id: "org-f", name: "F" } },
      grants: null,
    });
  });

  it("un élément lu sans droit est un désaccord avec le filtre : il lève", () => {
    expect(() => toAccessView(row(grants), { actorId: "b", organizationIds: new Set() })).toThrow(
      "[access] ex-1 lu sans droit par b",
    );
  });
});

describe("libraryScopeWhere", () => {
  it.each([
    [LibraryScope.ALL, {}],
    [LibraryScope.MINE, { coachId: "m" }],
    [LibraryScope.SHARED, { coachId: { not: "m" } }],
  ] as const)("%s", (scope, expected) => {
    expect(libraryScopeWhere(scope, "m")).toEqual(expected);
  });
});

const F = { organization: { id: "org-f", name: "F" }, level: "READ" } as const;
const G = { organization: { id: "org-g", name: "G" }, level: "WRITE" } as const;

describe("organizationsReadingAfter", () => {
  it("« Aucun » retire l'entreprise, un niveau l'ajoute ou la garde", () => {
    expect(
      organizationsReadingAfter(
        [F, G],
        [
          { organizationId: "org-f", level: null },
          { organizationId: "org-g", level: "READ" },
          { organizationId: "org-h", level: "WRITE" },
        ],
      ),
    ).toEqual(new Set(["org-g", "org-h"]));
  });
});

describe("citationsLosingRead", () => {
  const memberships: Record<string, string[]> = { m: ["org-f"], n: ["org-f", "org-g"], b: [] };
  const organizationsOf = (coachId: string) => new Set(memberships[coachId] ?? []);
  const citations = [
    { sessionId: "s-m", coachId: "m" },
    { sessionId: "s-n", coachId: "n" },
    { sessionId: "s-b", coachId: "b" },
  ];

  it("retirer F orpheline la séance de M, pas celle de N qui lit encore par G", () => {
    expect(
      citationsLosingRead(
        [F, G],
        [{ organizationId: "org-f", level: null }],
        citations,
        organizationsOf,
      ),
    ).toEqual(["s-m"]);
  });

  it("passer d'Écriture à Lecture ne retire la lecture à personne", () => {
    expect(
      citationsLosingRead(
        [G],
        [{ organizationId: "org-g", level: "READ" }],
        citations,
        organizationsOf,
      ),
    ).toEqual([]);
  });

  it("un Coach qui ne lisait déjà plus l'exercice ne bloque rien", () => {
    expect(
      citationsLosingRead(
        [F],
        [{ organizationId: "org-f", level: null }],
        [{ sessionId: "s-b", coachId: "b" }],
        organizationsOf,
      ),
    ).toEqual([]);
  });
});
