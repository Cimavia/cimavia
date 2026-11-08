import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { webUrlOf } from "./web-url";

const configWith = (webUrl: string | undefined) =>
  ({ get: () => webUrl }) as unknown as ConfigService<EnvSchema, true>;

describe("webUrlOf", () => {
  it("rend WEB_URL telle quelle", () => {
    expect(webUrlOf(configWith("https://app.cimavia.fr"))).toBe("https://app.cimavia.fr");
  });

  // Vide, `ConfigService` rend la chaîne brute de `process.env` : ce n'est pas une URL.
  it.each([undefined, ""])("rend null sans WEB_URL (%j)", (webUrl) => {
    expect(webUrlOf(configWith(webUrl))).toBeNull();
  });
});
