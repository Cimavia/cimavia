import { describe, expect, it } from "vitest";
import type { ScheduledSessionDto } from "../dto/plan.schema";
import {
  checkedUnitsOf,
  checkUnit,
  countedRoundsOf,
  isTrackingSent,
  type SessionTracking,
  sameTracking,
  setRounds,
  toggleUnit,
  trackingOfExercises,
  withSentTracking,
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

  // Le déroulé coche dans l'ordre du temps, mais une unité sautée puis rattrapée arrive après :
  // la liste reste triée, sinon deux suivis identiques se liraient comme différents.
  it("ajoute une unité en gardant les index triés", () => {
    const start = checkUnit({}, "ex", "blk", 3);
    expect(checkUnit(start, "ex", "blk", 1)).toEqual({ ex: { blk: { checked: [1, 3] } } });
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

describe("trackingOfExercises", () => {
  const exercises = [
    { id: "sse_a", blocks: [{ id: "b" }] },
    { id: "sse_b", blocks: [{ id: "b" }, { id: "c" }] },
  ];

  it("écarte la coche d'un exercice que le coach a retiré de la séance", () => {
    const tracking = { sse_a: { b: { checked: [0] } }, sse_retire: { b: { checked: [0, 1] } } };
    expect(trackingOfExercises(tracking, exercises)).toEqual({ sse_a: { b: { checked: [0] } } });
  });

  it("garde « non suivi » : c'est une intention, pas une absence", () => {
    expect(trackingOfExercises({ sse_b: null }, exercises)).toEqual({ sse_b: null });
  });

  it("écarte la coche d'un bloc que le coach a retiré de l'exercice", () => {
    const tracking = { sse_b: { c: { rounds: 3 }, retire: { checked: [0] } } };
    expect(trackingOfExercises(tracking, exercises)).toEqual({ sse_b: { c: { rounds: 3 } } });
  });

  it("ne touche pas à l'exercice dont tous les blocs sont encore là", () => {
    const intact = { b: { checked: [0] } };
    const pruned = trackingOfExercises(
      { sse_a: intact, sse_b: { retire: { rounds: 1 } } },
      exercises,
    );
    expect(pruned).toEqual({ sse_a: intact, sse_b: {} });
    expect(pruned.sse_a).toBe(intact);
  });

  it("rend le suivi lui-même quand tout est encore dans la séance", () => {
    const tracking = { sse_a: {}, sse_b: { b: { checked: [1] }, c: { rounds: 2 } } };
    expect(trackingOfExercises(tracking, exercises)).toBe(tracking);
  });
});

describe("isTrackingSent", () => {
  const exercises = [
    { id: "sse_a", blocks: [{ id: "b" }] },
    { id: "sse_b", blocks: [{ id: "b" }] },
  ];
  const sent = { sse_a: { b: { checked: [0, 1, 2, 3] } } };

  it("vrai quand rien n'a bougé depuis l'envoi", () => {
    expect(isTrackingSent({ sse_a: { b: { checked: [0, 1, 2, 3] } } }, sent, exercises)).toBe(true);
  });

  it("faux quand une case a été décochée pendant l'envoi", () => {
    expect(isTrackingSent({ sse_a: { b: { checked: [0, 1, 2] } } }, sent, exercises)).toBe(false);
  });

  it("faux quand un autre exercice a été coché pendant l'envoi", () => {
    const current = { ...sent, sse_b: { b: { checked: [0] } } };
    expect(isTrackingSent(current, sent, exercises)).toBe(false);
  });

  it("ignore une coche sur un exercice retiré : elle n'est jamais partie", () => {
    const current = { ...sent, sse_retire: { b: { checked: [0] } } };
    expect(isTrackingSent(current, sent, exercises)).toBe(true);
  });

  it("ignore une coche sur un bloc retiré : elle n'est jamais partie non plus", () => {
    const current = { sse_a: { b: { checked: [0, 1, 2, 3] }, retire: { checked: [0] } } };
    expect(isTrackingSent(current, sent, exercises)).toBe(true);
  });
});

describe("withSentTracking", () => {
  // Trois exercices : un suivi, un non suivi, un que l'envoi ne cite pas.
  const session = {
    id: "s-1",
    exercises: [
      { id: "sx-1", tracking: { "b-1": { checked: [0, 1, 2] } } },
      { id: "sx-2", tracking: { "b-1": { checked: [0] } } },
      { id: "sx-3", tracking: { "b-1": { rounds: 4 } } },
    ],
  } as unknown as ScheduledSessionDto;

  it("remplace ce que l'envoi cite, efface sur null, garde le reste", () => {
    const next = withSentTracking(session, {
      "sx-1": { "b-1": { checked: [0, 1, 2, 3] } },
      "sx-2": null,
    });

    expect(next.exercises.map((exercise) => exercise.tracking)).toEqual([
      { "b-1": { checked: [0, 1, 2, 3] } },
      null,
      { "b-1": { rounds: 4 } },
    ]);
    // L'exercice non cité est rendu tel quel, pas recopié.
    expect(next.exercises[2]).toBe(session.exercises[2]);
  });
});

describe("checkedUnitsOf", () => {
  it("rend les index cochés d'un bloc", () => {
    expect(checkedUnitsOf({ checked: [0, 2] })).toEqual([0, 2]);
  });

  it.each([
    ["un bloc pas encore touché", undefined],
    ["un compteur d'AMRAP", { rounds: 3 }],
  ])("ne coche rien sur %s", (_case, state) => {
    expect(checkedUnitsOf(state)).toEqual([]);
  });
});

describe("countedRoundsOf", () => {
  it("rend les tours comptés d'un AMRAP", () => {
    expect(countedRoundsOf({ rounds: 3 })).toBe(3);
  });

  it.each([
    ["un bloc pas encore touché", undefined],
    ["un bloc à cases", { checked: [0, 1] }],
  ])("part de zéro sur %s", (_case, state) => {
    expect(countedRoundsOf(state)).toBe(0);
  });
});
