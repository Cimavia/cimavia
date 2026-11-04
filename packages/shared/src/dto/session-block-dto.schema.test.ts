import { describe, expect, it } from "vitest";
import { gridOf, reps, settingsOf } from "../../test/block-fixtures";
import { CLIENT_KEY_MAX_LENGTH } from "./client-key.schema";
import { blockReferenceSchema } from "./session-block-dto.schema";

describe("blockReferenceSchema", () => {
  // Relue depuis la base : une référence stockée avant la borne se lit encore (#297, #354).
  it("relit une clé et une grille dont les identifiants dépassent la borne", () => {
    const tooLong = "k".repeat(CLIENT_KEY_MAX_LENGTH + 1);
    const grid = gridOf([{ ...reps, id: tooLong }]);
    const reference = {
      settings: settingsOf(),
      exercises: [{ key: tooLong, exerciseId: null, note: null, grid }],
    };
    expect(blockReferenceSchema.safeParse(reference).success).toBe(true);
  });
});
