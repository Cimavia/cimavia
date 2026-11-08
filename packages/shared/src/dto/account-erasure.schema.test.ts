import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH } from "../auth";
import { eraseAccountSchema } from "./account-erasure.schema";

describe("eraseAccountSchema", () => {
  it("accepte un mot de passe", () => {
    expect(eraseAccountSchema.safeParse({ password: "secret" }).success).toBe(true);
  });

  it.each([
    ["absent", {}],
    ["vide", { password: "" }],
    ["trop long", { password: "x".repeat(PASSWORD_MAX_LENGTH + 1) }],
    ["accompagné d'un autre champ", { password: "secret", userId: "autre" }],
  ])("refuse un mot de passe %s", (_cas, body) => {
    expect(eraseAccountSchema.safeParse(body).success).toBe(false);
  });
});
