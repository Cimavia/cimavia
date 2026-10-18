import { LibraryScope, MyAccessLevel } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import {
  type AccessRow,
  citationsLosingRead,
  grantsAfter,
  libraryScopeWhere,
  toAccessView,
  toCoachGrantDtos,
  toGrantDtos,
} from "./access.mapper";

const grantRow = (id: string, name: string, level: "NONE" | "READ" | "WRITE") => ({
  level,
  organization: { id, user: { name } },
  coach: null,
});

const coachRow = (id: string, name: string, level: "NONE" | "READ" | "WRITE") => ({
  level,
  organization: null,
  coach: { id, name },
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

  it("écarte la ligne d'un Coach, et le NONE d'un cycle fermé exprès (#607)", () => {
    expect(toGrantDtos([coachRow("m", "M", "WRITE"), grantRow("org-f", "F", "NONE")])).toEqual([]);
  });
});

describe("toCoachGrantDtos (#608)", () => {
  it("rend les lignes des Coachs, NONE compris, triées par nom puis par id", () => {
    expect(
      toCoachGrantDtos([
        coachRow("m", "Morgan", "NONE"),
        grantRow("org-f", "F", "WRITE"),
        coachRow("b2", "Alex", "READ"),
        coachRow("b1", "Alex", "WRITE"),
      ]),
    ).toEqual([
      { coach: { id: "b1", name: "Alex" }, level: "WRITE" },
      { coach: { id: "b2", name: "Alex" }, level: "READ" },
      { coach: { id: "m", name: "Morgan" }, level: "NONE" },
    ]);
  });
});

describe("toAccessView", () => {
  const grants = [grantRow("org-f", "F", "READ")];

  it("le propriétaire voit les droits accordés", () => {
    expect(toAccessView(row(grants), { actorId: "c", organizationIds: new Set() })).toEqual({
      owner: { id: "c", name: "Camille" },
      myAccess: { level: MyAccessLevel.OWNER, via: null },
      grants: [{ organization: { id: "org-f", name: "F" }, level: "READ" }],
      coachGrants: [],
    });
  });

  it("un autre lecteur voit son droit et sa provenance, jamais les droits des autres", () => {
    expect(
      toAccessView(row(grants), { actorId: "m", organizationIds: new Set(["org-f"]) }),
    ).toEqual({
      owner: { id: "c", name: "Camille" },
      myAccess: { level: MyAccessLevel.READ, via: { id: "org-f", name: "F" } },
      grants: null,
      coachGrants: null,
    });
  });

  it("la ligne du lecteur l'emporte sur son entreprise, et ne doit rien à F (#608)", () => {
    expect(
      toAccessView(row([...grants, coachRow("m", "M", "WRITE")]), {
        actorId: "m",
        organizationIds: new Set(["org-f"]),
      }).myAccess,
    ).toEqual({ level: MyAccessLevel.WRITE, via: null });
  });

  it("une ligne NONE lue par le filtre serait un désaccord : il lève (#608)", () => {
    expect(() =>
      toAccessView(row([...grants, coachRow("m", "M", "NONE")]), {
        actorId: "m",
        organizationIds: new Set(["org-f"]),
      }),
    ).toThrow("[access] ex-1 lu sans droit par m");
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
const lineOf = (id: string, level: "NONE" | "READ" | "WRITE") =>
  ({ coach: { id, name: id.toUpperCase() }, level }) as const;

describe("grantsAfter", () => {
  it("« Aucun » retire l'entreprise, un niveau l'ajoute ou la remplace", () => {
    expect(
      grantsAfter(
        { grants: [F, G], coachGrants: [] },
        {
          changes: [
            { organizationId: "org-f", level: null },
            { organizationId: "org-g", level: "READ" },
            { organizationId: "org-h", level: "WRITE" },
          ],
          coachChanges: [],
        },
      ).grants,
    ).toEqual([
      { organization: G.organization, level: "READ" },
      { organization: { id: "org-h", name: "org-h" }, level: "WRITE" },
    ]);
  });

  it("« Hérité » retire la ligne d'un Coach (#608), un niveau la pose, NONE compris", () => {
    expect(
      grantsAfter(
        { grants: [], coachGrants: [lineOf("m", "READ")] },
        {
          changes: [],
          coachChanges: [
            { coachId: "m", level: null },
            { coachId: "n", level: "NONE" },
          ],
        },
      ).coachGrants,
    ).toEqual([{ coach: { id: "n", name: "n" }, level: "NONE" }]);
  });

  it("ne touche pas les droits reçus", () => {
    const current = { grants: [F], coachGrants: [lineOf("m", "READ")] };
    grantsAfter(current, {
      changes: [{ organizationId: "org-f", level: null }],
      coachChanges: [{ coachId: "m", level: null }],
    });
    expect(current).toEqual({ grants: [F], coachGrants: [lineOf("m", "READ")] });
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
  const losing = (
    current: { grants: (typeof F | typeof G)[]; coachGrants?: ReturnType<typeof lineOf>[] },
    input: {
      changes?: Parameters<typeof grantsAfter>[1]["changes"];
      coachChanges?: Parameters<typeof grantsAfter>[1]["coachChanges"];
    },
    cited = citations,
  ) =>
    citationsLosingRead(
      "c",
      { grants: current.grants, coachGrants: current.coachGrants ?? [] },
      { changes: input.changes ?? [], coachChanges: input.coachChanges ?? [] },
      cited,
      organizationsOf,
    );

  it("retirer F orpheline la séance de M, pas celle de N qui lit encore par G", () => {
    expect(
      losing({ grants: [F, G] }, { changes: [{ organizationId: "org-f", level: null }] }),
    ).toEqual(["s-m"]);
  });

  it("passer d'Écriture à Lecture ne retire la lecture à personne", () => {
    expect(
      losing({ grants: [G] }, { changes: [{ organizationId: "org-g", level: "READ" }] }),
    ).toEqual([]);
  });

  it("un Coach qui ne lisait déjà plus l'exercice ne bloque rien", () => {
    expect(
      losing({ grants: [F] }, { changes: [{ organizationId: "org-f", level: null }] }, [
        { sessionId: "s-b", coachId: "b" },
      ]),
    ).toEqual([]);
  });

  it("fermer la ligne de M orpheline sa séance, même si F l'ouvre encore (#608)", () => {
    expect(losing({ grants: [F] }, { coachChanges: [{ coachId: "m", level: "NONE" }] })).toEqual([
      "s-m",
    ]);
  });

  it("une ligne de Coach qui reste protège du retrait de son entreprise (#608)", () => {
    expect(
      losing(
        { grants: [F], coachGrants: [lineOf("m", "READ")] },
        { changes: [{ organizationId: "org-f", level: null }] },
      ),
    ).toEqual(["s-n"]);
  });

  it("rendre M à « Hérité » sans entreprise ouverte lui retire la lecture (#608)", () => {
    expect(
      losing(
        { grants: [], coachGrants: [lineOf("m", "WRITE")] },
        { coachChanges: [{ coachId: "m", level: null }] },
      ),
    ).toEqual(["s-m"]);
  });
});
