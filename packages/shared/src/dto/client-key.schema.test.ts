import { describe, expect, it } from "vitest";
import { CLIENT_KEY_MAX_LENGTH, clientKeySchema } from "./client-key.schema";

describe("clientKeySchema", () => {
  it("borne la clé à sa constante", () => {
    expect(clientKeySchema.safeParse("k".repeat(CLIENT_KEY_MAX_LENGTH)).success).toBe(true);
    expect(clientKeySchema.safeParse("k".repeat(CLIENT_KEY_MAX_LENGTH + 1)).success).toBe(false);
  });

  it("tient un UUID", () => {
    expect(clientKeySchema.safeParse("0b6f1c2e-5d4a-4c3b-9a8e-7f6d5c4b3a21").success).toBe(true);
  });

  it("exige une clé", () => {
    expect(clientKeySchema.safeParse("").success).toBe(false);
  });
});
