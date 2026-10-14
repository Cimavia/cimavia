import { describe, expect, it } from "vitest";
import { type AccessGrantDto, AccessLevel } from "../dto/access.schema";
import { accessChanges, MIXED_ACCESS, type PanelAccess, panelAccess } from "./access-panel.util";

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
