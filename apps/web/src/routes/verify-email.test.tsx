import { describe, expect, it } from "vitest";
import { parseVerifyEmailSearch as parse } from "@/routes/verify-email";

describe("parseVerifyEmailSearch", () => {
  // L'API ne redirige ici sans `error` qu'après avoir écrit `emailVerified`.
  it("lit l'absence d'erreur comme une adresse vérifiée", () => {
    expect(parse({})).toEqual({ failed: false });
    expect(parse({ error: "" })).toEqual({ failed: false });
  });

  it.each(["TOKEN_EXPIRED", "INVALID_TOKEN", "USER_NOT_FOUND", 42])(
    "lit l'erreur %s comme un échec, sans en garder le code",
    (error) => {
      expect(parse({ error })).toEqual({ failed: true });
    },
  );
});
