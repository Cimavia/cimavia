import { describe, expect, it } from "vitest";
import { expectedVersionSchema } from "./expected-version.schema";

describe("expectedVersionSchema", () => {
  it("accepte l'horodatage ISO que l'API rend dans updatedAt", () => {
    expect(expectedVersionSchema.safeParse("2026-10-12T08:00:00.000Z").success).toBe(true);
  });

  // `null` n'a pas de sens ici : l'élément existe, et la fiche est seule à créer par upsert.
  it.each([
    ["null", null],
    ["une date sans heure", "2026-10-12"],
    ["un texte libre", "hier"],
  ])("refuse %s", (_label, value) => {
    expect(expectedVersionSchema.safeParse(value).success).toBe(false);
  });
});
