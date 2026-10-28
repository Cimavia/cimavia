import { describe, expect, it } from "vitest";
import { gridOf, issuesOf, load, settingsOf } from "../../test/block-fixtures";
import { scheduledDosageInputSchema } from "./scheduled-dosage.schema";

const VERSION = "2026-10-01T00:00:00.000Z";

const session = (id: string) => ({
  id,
  expectedUpdatedAt: VERSION,
  blocks: [
    {
      id: "block-1",
      settings: settingsOf(),
      exercises: [{ key: "a", grid: gridOf([load], [60]) }],
    },
  ],
});

describe("scheduledDosageInputSchema", () => {
  it("accepte les copies changées, chacune sous sa version", () => {
    expect(
      issuesOf(scheduledDosageInputSchema, { sessions: [session("s1"), session("s2")] }),
    ).toEqual([]);
  });

  it("refuse une séance citée deux fois", () => {
    expect(
      issuesOf(scheduledDosageInputSchema, { sessions: [session("s1"), session("s1")] }),
    ).toEqual([": Une séance est citée deux fois."]);
  });

  it("refuse un envoi sans séance", () => {
    expect(issuesOf(scheduledDosageInputSchema, { sessions: [] })).toEqual([
      "sessions: Too small: expected array to have >=1 items [too_small]",
    ]);
  });

  it("refuse un bloc sans exercice : la composition ne s'y change pas", () => {
    const empty = {
      ...session("s1"),
      blocks: [{ id: "b", settings: settingsOf(), exercises: [] }],
    };
    expect(issuesOf(scheduledDosageInputSchema, { sessions: [empty] })).toEqual([
      "sessions.0.blocks.0.exercises: Too small: expected array to have >=1 items [too_small]",
    ]);
  });

  it("refuse ce que Dosage ne règle pas, comme l'origine d'un exercice", () => {
    const [block] = session("s1").blocks;
    const withOrigin = {
      ...session("s1"),
      blocks: [
        { ...block, exercises: [{ key: "a", grid: gridOf([load]), origin: { kind: "ADDED" } }] },
      ],
    };
    expect(issuesOf(scheduledDosageInputSchema, { sessions: [withOrigin] })).toEqual([
      'sessions.0.blocks.0.exercises.0: Unrecognized key: "origin" [unrecognized_keys]',
    ]);
  });
});
