import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
  Post,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpAdapter } from "../app.setup";
import { RateLimitModule } from "./rate-limit.module";
import {
  actorTracker,
  NoRateLimit,
  RATE_LIMITS,
  RateLimit,
  RateLimitPolicy,
} from "./rate-limit.policy";

/** Tient le rôle de l'AuthGuard de Better Auth : pose `request.user` d'après un en-tête. */
@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const id = request.headers["x-user"];
    request.user = typeof id === "string" ? { id } : null;
    return true;
  }
}

@Controller()
class RoutesController {
  @Get("liste")
  liste() {
    return {};
  }

  @Get("autre-liste")
  autreListe() {
    return {};
  }

  @Get("sonde")
  @NoRateLimit()
  sonde() {
    return {};
  }

  @Post("upload-url")
  @RateLimit(RateLimitPolicy.UPLOAD)
  uploadUrl() {
    return {};
  }

  @Post("autre-upload-url")
  @RateLimit(RateLimitPolicy.UPLOAD)
  autreUploadUrl() {
    return {};
  }

  @Post("messages")
  @RateLimit(RateLimitPolicy.MESSAGE)
  message() {
    return {};
  }

  @Post("invitations")
  @RateLimit(RateLimitPolicy.INVITATION)
  invitation() {
    return {};
  }
}

/** Une politique posée sur le contrôleur vaut pour chacune de ses routes. */
@Controller("organisation")
@RateLimit(RateLimitPolicy.INVITATION)
class ClassLevelController {
  @Post("invitations")
  invite() {
    return {};
  }

  @Get("sonde")
  @NoRateLimit()
  sonde() {
    return {};
  }
}

let app: NestFastifyApplication;

// Une app par cas : les compteurs vivent dans le module, et un cas ne doit pas hériter des
// requêtes du précédent.
beforeEach(async () => {
  const module = await Test.createTestingModule({
    // Le garde d'authentification dans le module RACINE : ses `APP_GUARD` passent avant ceux des
    // modules importés — l'ordre même d'`AppModule`, que ce banc reproduit.
    imports: [RateLimitModule],
    controllers: [RoutesController, ClassLevelController],
    providers: [{ provide: APP_GUARD, useClass: FakeAuthGuard }],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(createHttpAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterEach(async () => {
  await app?.close();
});

/** Envoie `count` requêtes à la suite et rend leurs statuts. */
async function hit(method: "GET" | "POST", url: string, user: string, count = 1) {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const response = await app.inject({ method, url, headers: { "x-user": user } });
    statuses.push(response.statusCode);
  }
  return statuses;
}

const ok = (statuses: number[]) => statuses.every((status) => status < 400);

describe("RateLimitModule — une borne par acteur, après l'authentification (#782)", () => {
  it("rend 429 au-delà de la borne d'upload, et seulement à cet acteur", async () => {
    const { limit } = RATE_LIMITS.uploadPerMinute;

    expect(ok(await hit("POST", "/upload-url", "coach-a", limit))).toBe(true);
    expect(await hit("POST", "/upload-url", "coach-a")).toEqual([429]);
    expect(await hit("POST", "/upload-url", "coach-b")).toEqual([201]);
  });

  it("partage la borne d'upload entre toutes les routes d'upload d'un acteur", async () => {
    const half = RATE_LIMITS.uploadPerMinute.limit / 2;
    await hit("POST", "/upload-url", "coach-a", half);
    await hit("POST", "/autre-upload-url", "coach-a", half);

    expect(await hit("POST", "/autre-upload-url", "coach-a")).toEqual([429]);
    expect(await hit("POST", "/upload-url", "coach-b")).toEqual([201]);
  });

  it("borne l'envoi de messages", async () => {
    const { limit } = RATE_LIMITS.message;

    expect(ok(await hit("POST", "/messages", "athlete", limit))).toBe(true);
    expect(await hit("POST", "/messages", "athlete")).toEqual([429]);
  });

  it("borne les invitations", async () => {
    const { limit } = RATE_LIMITS.invitation;

    expect(ok(await hit("POST", "/invitations", "coach-a", limit))).toBe(true);
    expect(await hit("POST", "/invitations", "coach-a")).toEqual([429]);
  });

  it("applique une politique posée sur le contrôleur", async () => {
    const { limit } = RATE_LIMITS.invitation;

    expect(ok(await hit("POST", "/organisation/invitations", "company", limit))).toBe(true);
    expect(await hit("POST", "/organisation/invitations", "company")).toEqual([429]);
  });

  it("ne serre pas une route qui ne déclare aucune politique", async () => {
    const { limit } = RATE_LIMITS.invitation;

    expect(ok(await hit("GET", "/liste", "coach-a", limit + 1))).toBe(true);
  });

  it("partage le plafond global entre toutes les routes d'un acteur", async () => {
    const half = RATE_LIMITS.global.limit / 2;
    await hit("GET", "/liste", "coach-a", half);
    await hit("GET", "/autre-liste", "coach-a", half);

    expect(await hit("GET", "/liste", "coach-a")).toEqual([429]);
    expect(await hit("GET", "/liste", "coach-b")).toEqual([200]);
  });

  it("ne compte jamais une route NoRateLimit", async () => {
    expect(ok(await hit("GET", "/sonde", "sonde", RATE_LIMITS.global.limit + 1))).toBe(true);
  });

  it("sort une route NoRateLimit de la politique posée sur son contrôleur", async () => {
    const { limit } = RATE_LIMITS.invitation;

    expect(ok(await hit("GET", "/organisation/sonde", "company", limit + 1))).toBe(true);
  });

  it("annonce quand réessayer", async () => {
    await hit("POST", "/invitations", "coach-a", RATE_LIMITS.invitation.limit);
    const refused = await app.inject({
      method: "POST",
      url: "/invitations",
      headers: { "x-user": "coach-a" },
    });

    expect(refused.statusCode).toBe(429);
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    // Les en-têtes nommés de la librairie, qu'aucun client ne lit, ne sortent pas.
    expect(Object.keys(refused.headers).filter((name) => name.startsWith("x-ratelimit"))).toEqual(
      [],
    );
  });
});

describe("actorTracker", () => {
  it("compte l'acteur authentifié, quelle que soit son adresse", () => {
    expect(actorTracker({ user: { id: "u1" }, ip: "10.0.0.1" })).toBe("user:u1");
    expect(actorTracker({ user: { id: "u1" }, ip: "10.0.0.2" })).toBe("user:u1");
  });

  it("retombe sur l'IP sans acteur — une route publique", () => {
    expect(actorTracker({ user: null, ip: "10.0.0.1" })).toBe("ip:10.0.0.1");
    expect(actorTracker({ ip: "10.0.0.1" })).toBe("ip:10.0.0.1");
  });

  it("ne confond pas une IP absente avec un acteur", () => {
    expect(actorTracker({})).toBe("ip:unknown");
  });
});
