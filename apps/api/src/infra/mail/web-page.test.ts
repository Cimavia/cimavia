import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { webPage } from "./web-page";

const configWith = (webUrl: string | undefined) =>
  ({ get: () => webUrl }) as unknown as ConfigService<EnvSchema, true>;

describe("webPage", () => {
  it("colle la route à WEB_URL, sans double barre", () => {
    expect(webPage(configWith("https://app.cimavia.fr/"), "/login")).toBe(
      "https://app.cimavia.fr/login",
    );
  });

  // Vide dans l'environnement, `ConfigService` rend la chaîne de `process.env` : pas un hôte.
  it.each([undefined, ""])("rend null sans WEB_URL (%j)", (webUrl) => {
    expect(webPage(configWith(webUrl), "/login")).toBeNull();
  });
});
