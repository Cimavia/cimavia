import { describe, expect, it } from "vitest";
import { DEFAULT_PANEL_LAYOUT, parsePanelLayout } from "./panel-layout.util";

describe("parsePanelLayout", () => {
  it("relit un réglage complet", () => {
    const raw = JSON.stringify({
      mode: "side",
      popover: { width: 480, height: 600 },
      sideWidth: 720,
    });

    expect(parsePanelLayout(raw)).toEqual({
      mode: "side",
      popover: { width: 480, height: 600 },
      sideWidth: 720,
    });
  });

  it.each([
    ["rien d'enregistré", null],
    ["un JSON cassé", "{mode:"],
    ["autre chose qu'un objet", "42"],
    ["null", "null"],
  ])("repart du défaut sur %s", (_case, raw) => {
    expect(parsePanelLayout(raw)).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  // Une valeur abîmée ne coûte que son champ : le mode choisi survit.
  it("écarte chaque champ invalide pour lui-même", () => {
    const raw = JSON.stringify({
      mode: "side",
      popover: { width: "large", height: 600 },
      sideWidth: -1,
    });

    expect(parsePanelLayout(raw)).toEqual({ mode: "side", popover: null, sideWidth: null });
  });

  it("ne connaît que deux modes", () => {
    expect(parsePanelLayout(JSON.stringify({ mode: "fullscreen" })).mode).toBe("popover");
  });
});
