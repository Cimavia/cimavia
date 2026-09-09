import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { VersionService } from "./version.service";

/**
 * Un double minimal plutôt qu'un module Nest monté : le service n'a qu'une dépendance et aucune
 * logique asynchrone. Ce qui se vérifie ici est la SEULE chose qui puisse mal tourner — le
 * traitement de l'absence.
 */
function serviceReading(env: Partial<EnvSchema>) {
  const config = {
    get: (key: keyof EnvSchema) => env[key],
  } as unknown as ConfigService<EnvSchema, true>;
  return new VersionService(config);
}

describe("VersionService", () => {
  it("rend la version et le build quand l'image les porte", () => {
    const service = serviceReading({
      APP_VERSION: "1.2.0",
      APP_BUILD: "3f2a1c",
      APP_ENV: "production",
    });

    expect(service.current()).toEqual({ version: "1.2.0", build: "3f2a1c", env: "production" });
  });

  /**
   * Le cas qui compte, et que les e2e ne peuvent pas atteindre autrement : hors image, les deux
   * variables n'existent pas. `null` dit « je ne sais pas ». Un repli sur « 0.0.0 » affirmerait
   * une version que ce binaire n'est pas, et l'écran d'à-propos la montrerait sans sourciller.
   */
  it("rend null plutôt qu'un numéro inventé quand rien n'est injecté", () => {
    const service = serviceReading({ APP_ENV: "development" });

    expect(service.current()).toEqual({ version: null, build: null, env: "development" });
  });

  /**
   * Le tier ne se déduit PAS du numéro : une même version passe successivement par les trois.
   */
  it("rend le tier indépendamment de la version", () => {
    const service = serviceReading({ APP_VERSION: "1.2.0", APP_ENV: "staging" });

    expect(service.current()).toEqual({ version: "1.2.0", build: null, env: "staging" });
  });
});
