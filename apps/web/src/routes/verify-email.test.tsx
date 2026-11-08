import { VERIFY_EMAIL_PASSWORD_REQUIRED } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { parseVerifyEmailSearch as parse } from "@/routes/verify-email";

describe("parseVerifyEmailSearch", () => {
  // L'API ne redirige ici sans `error` qu'après avoir écrit `emailVerified`.
  it("lit l'absence d'erreur comme une adresse vérifiée", () => {
    expect(parse({})).toEqual({ outcome: "verified" });
    expect(parse({ error: "" })).toEqual({ outcome: "verified" });
  });

  it.each(["TOKEN_EXPIRED", "INVALID_TOKEN", "USER_NOT_FOUND", 42])(
    "lit l'erreur %s comme un échec, sans en garder le code",
    (error) => {
      expect(parse({ error })).toEqual({ outcome: "failed" });
    },
  );

  // Le compte a perdu son mot de passe (#270) : se connecter ne mènerait qu'à un 401.
  it("distingue le compte sans mot de passe", () => {
    expect(parse({ error: VERIFY_EMAIL_PASSWORD_REQUIRED })).toEqual({
      outcome: "passwordRequired",
    });
  });
});
