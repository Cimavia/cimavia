import { AdjustmentLevel, BlockType, type ExerciseBlocks } from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertShapeLocked } from "./dosage-lock.util";

const blocks = (label: string, reps: number): ExerciseBlocks => [
  {
    id: "blk_1",
    label,
    structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: 150 },
    metrics: [],
    rows: [{ id: "r1", values: { col_reps: reps } }],
  },
];

describe("assertShapeLocked", () => {
  it("laisse passer un changement de VALEUR, à chaque niveau", () => {
    for (const level of [AdjustmentLevel.SESSION, AdjustmentLevel.SCHEDULED]) {
      expect(() =>
        assertShapeLocked(level, blocks("Travail", 6), blocks("Travail", 8)),
      ).not.toThrow();
    }
  });

  it.each([
    [AdjustmentLevel.SESSION, "Structure verrouillée au niveau séance : blockLabel:blk_1"],
    [
      AdjustmentLevel.SCHEDULED,
      "Structure verrouillée au niveau séance planifiée : blockLabel:blk_1",
    ],
  ])("refuse un changement de FORME au niveau %s, en nommant le niveau et l'écart", (level, message) => {
    const attempt = () => assertShapeLocked(level, blocks("Travail", 6), blocks("Échauffement", 6));

    expect(attempt).toThrow(BadRequestException);
    expect(attempt).toThrow(message);
  });
});
