import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { browserOrigins } from "./origins";

const configWith = (env: Partial<EnvSchema>) =>
  ({ get: (key: keyof EnvSchema) => env[key] }) as unknown as ConfigService<EnvSchema, true>;

describe("browserOrigins", () => {
  // L'API elle-même, toujours : c'est l'origine du formulaire de réinitialisation servi par elle.
  it("rend la seule URL de l'API quand CORS_ORIGINS est absent", () => {
    expect(browserOrigins(configWith({ BETTER_AUTH_URL: "https://api.cimavia.fr" }))).toEqual([
      "https://api.cimavia.fr",
    ]);
  });

  it("ajoute les origines listées, espaces et entrées vides retirés, sans doublon", () => {
    const origins = browserOrigins(
      configWith({
        BETTER_AUTH_URL: "https://api.cimavia.fr",
        CORS_ORIGINS: " https://app.cimavia.fr ,, https://api.cimavia.fr,",
      }),
    );

    expect(origins).toEqual(["https://api.cimavia.fr", "https://app.cimavia.fr"]);
  });
});
