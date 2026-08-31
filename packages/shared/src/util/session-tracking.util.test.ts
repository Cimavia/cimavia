import { describe, expect, it } from "vitest";
import {
  checkUnit,
  type SessionTracking,
  sameTracking,
  setRounds,
  toggleUnit,
} from "./session-tracking.util";

describe("toggleUnit", () => {
  it("fait naître le suivi d'un exercice au premier appel", () => {
    expect(toggleUnit({}, "ex", "blk", 2)).toEqual({ ex: { blk: { checked: [2] } } });
  });

  it("garde les index TRIÉS, quel que soit l'ordre des taps", () => {
    let tracking: SessionTracking = {};
    for (const index of [3, 0, 2]) tracking = toggleUnit(tracking, "ex", "blk", index);
    expect(tracking).toEqual({ ex: { blk: { checked: [0, 2, 3] } } });
  });

  it("décoche, et laisse une liste VIDE — ce qui n'est pas « non suivi »", () => {
    const once = toggleUnit({}, "ex", "blk", 0);
    expect(toggleUnit(once, "ex", "blk", 0)).toEqual({ ex: { blk: { checked: [] } } });
  });

  it("ne touche ni aux autres blocs ni aux autres exercices", () => {
    const start: SessionTracking = { a: { b1: { checked: [1] } }, b: null };
    const next = toggleUnit(start, "a", "b2", 0);
    expect(next.a).toEqual({ b1: { checked: [1] }, b2: { checked: [0] } });
    expect(next.b).toBeNull();
  });
});

describe("checkUnit", () => {
  it("coche une fois et RESTE cochée : le déroulé y passe deux fois par unité", () => {
    const once = checkUnit({}, "ex", "blk", 1);
    expect(checkUnit(once, "ex", "blk", 1)).toBe(once);
  });
});

describe("setRounds", () => {
  it("compte sans plafond, et jamais sous zéro", () => {
    expect(setRounds({}, "ex", "blk", 42)).toEqual({ ex: { blk: { rounds: 42 } } });
    expect(setRounds({}, "ex", "blk", -1)).toEqual({ ex: { blk: { rounds: 0 } } });
  });
});

describe("sameTracking", () => {
  it("ignore l'ORDRE des clés — sinon « Enregistrer » resterait actif sans rien à envoyer", () => {
    const a: SessionTracking = { x: { b1: { checked: [0] } }, y: { b2: { rounds: 3 } } };
    const b: SessionTracking = { y: { b2: { rounds: 3 } }, x: { b1: { checked: [0] } } };
    expect(sameTracking(a, b)).toBe(true);
  });

  it("distingue « non suivi » de « suivi mais vide »", () => {
    expect(sameTracking({ x: null }, { x: {} })).toBe(false);
    expect(sameTracking({ x: {} }, { x: { b: { checked: [] } } })).toBe(false);
  });
});
