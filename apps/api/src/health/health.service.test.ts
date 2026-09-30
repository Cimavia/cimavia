import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../infra/prisma/prisma.service";
import { HealthService } from "./health.service";

/**
 * La base EN PANNE, que le harnais e2e ne sait pas produire : il tourne sur une vraie base, et
 * la couper ferait échouer toute la suite. C'est pourtant le seul cas où la sonde de readiness
 * sert à quelque chose — l'hébergeur retire alors l'instance du trafic au lieu d'y router des 500.
 */
function serviceOver(ping: () => Promise<unknown>) {
  return new HealthService({ $queryRaw: ping } as unknown as PrismaService);
}

describe("HealthService.ready", () => {
  it("rend 503, dit « degraded » et nomme la base en panne", async () => {
    const service = serviceOver(() => Promise.reject(new Error("connect ECONNREFUSED")));

    const error = await service.ready().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      status: "degraded",
      database: "down",
    });
  });

  // L'erreur du pilote (hôte, port, parfois l'utilisateur) ne sort pas : la route est publique.
  it("ne laisse pas fuiter l'erreur de la base dans la réponse", async () => {
    const service = serviceOver(() => Promise.reject(new Error("password authentication failed")));

    const error = (await service.ready().catch((caught: unknown) => caught)) as Error;

    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toContain(
      "password",
    );
  });
});
