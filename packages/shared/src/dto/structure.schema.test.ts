import { describe, expect, it } from "vitest";
import { asMuchAsPossible, beep, cycle, once, rounds, settingsOf } from "../../test/block-fixtures";
import {
  STRUCTURE_INSTRUCTIONS_MAX_LENGTH,
  STRUCTURE_MAX_DURATION_SECONDS,
  STRUCTURE_MAX_ROUNDS,
  STRUCTURE_NOTE_MAX_LENGTH,
  STRUCTURE_PRESET_NAME_KEY,
  STRUCTURE_PRESETS,
  StructurePresetKey,
  structureInputSchema,
  structureSettingsSchema,
} from "./structure.schema";
import { StructureOrder } from "./structure-answer.schema";

function issuePaths(input: unknown): string[] {
  const parsed = structureSettingsSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
}

describe("structureSettingsSchema", () => {
  it.each(Object.values(StructurePresetKey))("accepte la structure prête %s", (key) => {
    expect(structureSettingsSchema.safeParse(STRUCTURE_PRESETS[key]).success).toBe(true);
  });

  it("refuse un bip sans intervalle, et un intervalle sur « quand l'athlète a fini »", () => {
    expect(issuePaths(settingsOf({ advance: { kind: "BEEP" } as never }))).not.toEqual([]);
    expect(
      issuePaths(settingsOf({ advance: { kind: "ATHLETE", everySeconds: 60 } as never })),
    ).not.toEqual([]);
  });

  it("borne le nombre de tours de 1 à 99", () => {
    expect(issuePaths(settingsOf({ repeat: rounds(0) }))).toEqual(["repeat.rounds"]);
    expect(issuePaths(settingsOf({ repeat: rounds(STRUCTURE_MAX_ROUNDS + 1) }))).toEqual([
      "repeat.rounds",
    ]);
    expect(issuePaths(settingsOf({ repeat: rounds(STRUCTURE_MAX_ROUNDS) }))).toEqual([]);
  });

  it("refuse une durée nulle : un repos de 0 s n'est pas un repos, c'est `null`", () => {
    expect(issuePaths(settingsOf({ restBetweenRoundsSeconds: 0 }))).toEqual([
      "restBetweenRoundsSeconds",
    ]);
  });

  it("borne chaque durée à 3 h", () => {
    expect(issuePaths(settingsOf({ limitSeconds: STRUCTURE_MAX_DURATION_SECONDS }))).toEqual([]);
    expect(issuePaths(settingsOf({ limitSeconds: STRUCTURE_MAX_DURATION_SECONDS + 1 }))).toEqual([
      "limitSeconds",
    ]);
  });

  it("refuse « autant que possible » et « une seule fois » avec un bip ou un cycle", () => {
    expect(issuePaths(settingsOf({ advance: beep(60), repeat: asMuchAsPossible(600) }))).toEqual([
      "repeat",
    ]);
    expect(issuePaths(settingsOf({ advance: cycle(20, 10), repeat: once }))).toEqual(["repeat"]);
  });

  it("refuse une valeur sur un réglage grisé", () => {
    expect(issuePaths(settingsOf({ advance: beep(60), restBetweenRoundsSeconds: 60 }))).toEqual([
      "restBetweenRoundsSeconds",
    ]);
    expect(
      issuePaths(settingsOf({ advance: cycle(20, 10), restBetweenExercisesSeconds: 30 })),
    ).toEqual(["restBetweenExercisesSeconds"]);
    expect(issuePaths(settingsOf({ repeat: asMuchAsPossible(600), limitSeconds: 900 }))).toEqual([
      "limitSeconds",
    ]);
  });

  it("refuse « un seul par… » sans bip ni cycle", () => {
    expect(issuePaths(settingsOf({ order: StructureOrder.ONE }))).toEqual(["order"]);
    expect(issuePaths(settingsOf({ advance: beep(60), order: StructureOrder.ONE }))).toEqual([]);
  });

  it("dit pourquoi il refuse, en refus métier", () => {
    const issues = (settings: unknown) =>
      structureSettingsSchema.safeParse(settings).error?.issues.map(({ code, message }) => ({
        code,
        message,
      }));
    expect(issues(settingsOf({ advance: beep(60), restBetweenRoundsSeconds: 60 }))).toEqual([
      {
        code: "custom",
        message: "Ce réglage est grisé par les autres réponses : il ne peut pas être choisi.",
      },
    ]);
    expect(issues(settingsOf({ order: StructureOrder.ONE }))).toEqual([
      {
        code: "custom",
        message: "« Un seul par… » demande un bip, ou un effort et un repos imposés.",
      },
    ]);
  });
});

describe("STRUCTURE_PRESET_NAME_KEY", () => {
  it("nomme chaque structure prête", () => {
    expect(Object.keys(STRUCTURE_PRESET_NAME_KEY).sort()).toEqual(
      Object.values(StructurePresetKey).sort(),
    );
  });
});

describe("structureInputSchema", () => {
  const valid = {
    name: "4×4 grimpe",
    tags: ["Grimpe"],
    note: "Garder 4 min même si l'athlète se sent prêt.",
    instructions: null,
    settings: settingsOf({ restBetweenRoundsSeconds: 240 }),
  };

  it("accepte une structure du Coach et normalise ses tags", () => {
    const parsed = structureInputSchema.parse(valid);
    expect(parsed.tags).toEqual(["grimpe"]);
  });

  it("refuse une structure sans nom", () => {
    expect(structureInputSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });

  it("refuse des réglages incohérents", () => {
    const settings = settingsOf({ advance: beep(60), restBetweenRoundsSeconds: 60 });
    expect(structureInputSchema.safeParse({ ...valid, settings }).success).toBe(false);
  });

  it("borne la note et la consigne", () => {
    const parses = (field: "note" | "instructions", length: number) =>
      structureInputSchema.safeParse({ ...valid, [field]: "x".repeat(length) }).success;
    expect(parses("note", STRUCTURE_NOTE_MAX_LENGTH)).toBe(true);
    expect(parses("note", STRUCTURE_NOTE_MAX_LENGTH + 1)).toBe(false);
    expect(parses("instructions", STRUCTURE_INSTRUCTIONS_MAX_LENGTH)).toBe(true);
    expect(parses("instructions", STRUCTURE_INSTRUCTIONS_MAX_LENGTH + 1)).toBe(false);
  });
});
