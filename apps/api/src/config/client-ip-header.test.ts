import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { clientIpHeaderOf } from "./client-ip-header";

const configWith = (header: string | undefined) =>
  ({ get: () => header }) as unknown as ConfigService<EnvSchema, true>;

describe("clientIpHeaderOf", () => {
  it("rend CLIENT_IP_HEADER tel quel", () => {
    expect(clientIpHeaderOf(configWith("cf-connecting-ip"))).toBe("cf-connecting-ip");
  });

  // Vide, `ConfigService` rend la chaîne brute de `process.env` : ce n'est pas un nom d'en-tête.
  it.each([undefined, ""])("rend null sans CLIENT_IP_HEADER (%j)", (header) => {
    expect(clientIpHeaderOf(configWith(header))).toBeNull();
  });
});
