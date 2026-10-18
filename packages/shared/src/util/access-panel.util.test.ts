import { describe, expect, it } from "vitest";
import { type AccessGrantDto, AccessLevel, type CoachGrantDto } from "../dto/access.schema";
import {
  accessChanges,
  type CoachPanelAccess,
  coachAccessChanges,
  inheritedAccess,
  MIXED_ACCESS,
  type PanelAccess,
  panelAccess,
  panelCoachAccess,
  panelCoaches,
} from "./access-panel.util";

const F = { id: "org-f", name: "F" };
const G = { id: "org-g", name: "G" };

const write = (organization: typeof F): AccessGrantDto => ({
  organization,
  level: AccessLevel.WRITE,
});
const read = (organization: typeof F): AccessGrantDto => ({
  organization,
  level: AccessLevel.READ,
});

describe("panelAccess", () => {
  it("un élément : la valeur de chaque entreprise, « Aucun » sans ligne de droit", () => {
    expect(panelAccess([[write(F)]], ["org-f", "org-g"])).toEqual(
      new Map([
        ["org-f", AccessLevel.WRITE],
        ["org-g", null],
      ]),
    );
  });

  it("plusieurs éléments d'accord : leur valeur commune, « Aucun » compris", () => {
    expect(panelAccess([[read(F)], [read(F), write(G)], [read(F)]], ["org-f"])).toEqual(
      new Map([["org-f", AccessLevel.READ]]),
    );
    expect(panelAccess([[], [write(F)]], ["org-g"])).toEqual(new Map([["org-g", null]]));
  });

  it("une valeur qui diffère est « Mixte », absence de ligne comprise (frame 6)", () => {
    expect(panelAccess([[write(F)], [], [write(F)]], ["org-f"])).toEqual(
      new Map([["org-f", MIXED_ACCESS]]),
    );
    expect(panelAccess([[write(F)], [read(F)]], ["org-f"])).toEqual(
      new Map([["org-f", MIXED_ACCESS]]),
    );
  });

  it("sans élément, rien n'est commun : « Mixte » plutôt qu'un niveau inventé", () => {
    expect(panelAccess([], ["org-f"])).toEqual(new Map([["org-f", MIXED_ACCESS]]));
  });
});

describe("accessChanges", () => {
  const initial = new Map<string, PanelAccess>([
    ["org-f", MIXED_ACCESS],
    ["org-g", AccessLevel.READ],
  ]);

  it("rien de touché, rien à envoyer", () => {
    expect(accessChanges(initial, new Map(initial))).toEqual([]);
  });

  it("une ligne laissée « Mixte » n'est pas envoyée : chaque élément garde sa valeur", () => {
    const edited = new Map<string, PanelAccess>([
      ["org-f", MIXED_ACCESS],
      ["org-g", AccessLevel.WRITE],
    ]);
    expect(accessChanges(initial, edited)).toEqual([
      { organizationId: "org-g", level: AccessLevel.WRITE },
    ]);
  });

  it("une ligne « Mixte » tranchée s'envoie, « Aucun » compris", () => {
    const edited = new Map<string, PanelAccess>([
      ["org-f", null],
      ["org-g", AccessLevel.READ],
    ]);
    expect(accessChanges(initial, edited)).toEqual([{ organizationId: "org-f", level: null }]);
  });

  it("une ligne remise à sa valeur de départ n'est pas un changement", () => {
    const edited = new Map<string, PanelAccess>([
      ["org-f", MIXED_ACCESS],
      ["org-g", AccessLevel.READ],
    ]);
    expect(accessChanges(initial, edited)).toEqual([]);
  });
});

describe("panelCoachAccess (#608)", () => {
  const line = (id: string, level: CoachGrantDto["level"]): CoachGrantDto => ({
    coach: { id, name: id },
    level,
  });

  it("« Hérité » sans ligne, et NONE se lit « Aucun », distinct de lui", () => {
    expect(panelCoachAccess([[line("m", AccessLevel.NONE)]], ["m", "b"])).toEqual(
      new Map([
        ["m", AccessLevel.NONE],
        ["b", null],
      ]),
    );
  });

  it("« Mixte » quand les éléments diffèrent, absence de ligne comprise", () => {
    expect(panelCoachAccess([[line("m", AccessLevel.NONE)], []], ["m"])).toEqual(
      new Map([["m", MIXED_ACCESS]]),
    );
  });
});

describe("coachAccessChanges (#608)", () => {
  const initial = new Map<string, CoachPanelAccess>([
    ["m", null],
    ["b", MIXED_ACCESS],
  ]);

  it("envoie les seules lignes changées, « Hérité » en null", () => {
    const edited = new Map<string, CoachPanelAccess>([
      ["m", AccessLevel.NONE],
      ["b", null],
    ]);
    expect(coachAccessChanges(initial, edited)).toEqual([
      { coachId: "m", level: AccessLevel.NONE },
      { coachId: "b", level: null },
    ]);
  });

  it("une ligne laissée « Mixte » ou remise à sa valeur n'est pas envoyée", () => {
    expect(coachAccessChanges(initial, new Map(initial))).toEqual([]);
  });
});

describe("inheritedAccess (#608)", () => {
  const values = new Map<string, PanelAccess>([
    ["org-f", AccessLevel.READ],
    ["org-g", AccessLevel.WRITE],
    ["org-h", null],
    ["org-x", MIXED_ACCESS],
  ]);

  it("le plus large des droits de ses entreprises, pas seulement la première", () => {
    expect(inheritedAccess(["org-f", "org-g"], values)).toBe(AccessLevel.WRITE);
    expect(inheritedAccess(["org-h", "org-f"], values)).toBe(AccessLevel.READ);
  });

  it("aucune entreprise ne l'ouvre : null", () => {
    expect(inheritedAccess(["org-h"], values)).toBeNull();
    expect(inheritedAccess(["org-inconnue"], values)).toBeNull();
  });

  it("« Mixte » si l'une d'elles l'est : l'héritage diffère d'un élément à l'autre", () => {
    expect(inheritedAccess(["org-g", "org-x"], values)).toBe(MIXED_ACCESS);
  });
});

describe("panelCoaches (#608)", () => {
  const coach = (coachId: string) => ({ coachId, name: coachId.toUpperCase() });
  const organizations = [
    { id: "org-f", name: "F", coaches: [coach("c"), coach("m"), coach("b")] },
    { id: "org-g", name: "G", coaches: [coach("m"), coach("d")] },
  ];

  it("tous les Coachs sous leur entreprise, sauf le propriétaire", () => {
    expect(panelCoaches(organizations, "c")).toEqual([
      {
        organizationId: "org-f",
        coaches: [
          { coachId: "m", name: "M", organizationIds: ["org-f", "org-g"] },
          { coachId: "b", name: "B", organizationIds: ["org-f"] },
        ],
      },
      {
        organizationId: "org-g",
        coaches: [{ coachId: "d", name: "D", organizationIds: ["org-g"] }],
      },
    ]);
  });

  it("un Coach de deux entreprises n'apparaît qu'une fois, sous la première", () => {
    const rows = panelCoaches(organizations, "c");
    expect(rows.flatMap((row) => row.coaches).filter((c) => c.coachId === "m")).toHaveLength(1);
  });
});
