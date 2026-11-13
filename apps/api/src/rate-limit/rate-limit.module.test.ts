import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
  Post,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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

/**
 * Le module tel qu'`AppModule` le monte, avec `CLIENT_IP_HEADER` pour seule configuration — les
 * variables du shell ignorées (`skipProcessEnv`) : un `.env` local ne doit pas changer le banc.
 */
async function buildApp(clientIpHeader?: string) {
  const module = await Test.createTestingModule({
    // Le garde d'authentification dans le module RACINE : ses `APP_GUARD` passent avant ceux des
    // modules importés — l'ordre même d'`AppModule`, que ce banc reproduit.
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        skipProcessEnv: true,
        load: [() => ({ CLIENT_IP_HEADER: clientIpHeader })],
      }),
      RateLimitModule,
    ],
    controllers: [RoutesController, ClassLevelController],
    providers: [{ provide: APP_GUARD, useClass: FakeAuthGuard }],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(createHttpAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}

afterEach(async () => {
  await app?.close();
});

/** Envoie `count` requêtes à la suite, avec ces en-têtes, et rend leurs statuts. */
async function send(
  method: "GET" | "POST",
  url: string,
  headers: Record<string, string>,
  count = 1,
) {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const response = await app.inject({ method, url, headers });
    statuses.push(response.statusCode);
  }
  return statuses;
}

/** Envoie `count` requêtes au nom de l'acteur `user`. */
const hit = (method: "GET" | "POST", url: string, user: string, count = 1) =>
  send(method, url, { "x-user": user }, count);

const ok = (statuses: number[]) => statuses.every((status) => status < 400);

describe("RateLimitModule — une borne par acteur, après l'authentification (#782)", () => {
  // Une app par cas : les compteurs vivent dans le module, et un cas ne doit pas hériter des
  // requêtes du précédent.
  beforeEach(async () => {
    await buildApp();
  });

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

/**
 * Derrière un proxy (#781) : sans acteur, chaque client a son compteur — et non celui du proxy,
 * l'adresse que Fastify voit pour tout le monde.
 */
describe("RateLimitModule — derrière un proxy (#781)", () => {
  const HEADER = "cf-connecting-ip";

  /** Des requêtes anonymes, toutes depuis la même connexion, au nom du client `ip`. */
  const hitAs = (ip: string, count = 1) => send("GET", "/liste", { [HEADER]: ip }, count);

  beforeEach(async () => {
    await buildApp(HEADER);
  });

  it("compte chaque client à part, pas le proxy par lequel ils passent tous", async () => {
    expect(ok(await hitAs("203.0.113.1", RATE_LIMITS.global.limit))).toBe(true);

    expect(await hitAs("203.0.113.1")).toEqual([429]);
    expect(await hitAs("203.0.113.2")).toEqual([200]);
  });
});

describe("actorTracker", () => {
  const HEADER = "cf-connecting-ip";

  it("compte l'acteur authentifié, quelle que soit son adresse", () => {
    expect(actorTracker({ user: { id: "u1" }, ip: "10.0.0.1" }, undefined)).toBe("user:u1");
    expect(actorTracker({ user: { id: "u1" }, headers: { [HEADER]: "203.0.113.9" } }, HEADER)).toBe(
      "user:u1",
    );
  });

  it("retombe sur l'IP de la connexion sans acteur ni en-tête configuré — le local", () => {
    expect(actorTracker({ user: null, ip: "10.0.0.1" }, undefined)).toBe("ip:10.0.0.1");
    expect(actorTracker({ ip: "10.0.0.1" }, undefined)).toBe("ip:10.0.0.1");
  });

  it("lit l'IP dans l'en-tête configuré, jamais dans la connexion du proxy", () => {
    expect(actorTracker({ ip: "172.18.0.5", headers: { [HEADER]: " 203.0.113.9 " } }, HEADER)).toBe(
      "ip:203.0.113.9",
    );
  });

  it("garde la même clé pour une IPv6 écrite en capitales ou en minuscules", () => {
    expect(actorTracker({ headers: { [HEADER]: "2001:DB8::1" } }, HEADER)).toBe("ip:2001:db8::1");
  });

  // Rien qu'on puisse croire : l'IP de la connexion est celle du proxy, pas celle du client. Une
  // valeur libre, elle, offrirait un compteur neuf à chaque requête.
  it.each([
    ["absent", {}],
    ["vide", { [HEADER]: " " }],
    // Node joint un en-tête répété ainsi ; Fastify ne rend un tableau que pour quelques en-têtes.
    ["répété, joint par Node", { [HEADER]: "203.0.113.9, 198.51.100.1" }],
    ["répété, en tableau", { [HEADER]: ["203.0.113.9", "198.51.100.1"] }],
    ["qui n'est pas une IP", { [HEADER]: "client-42" }],
  ])("ne retombe pas sur la connexion quand l'en-tête est %s", (_, headers) => {
    expect(actorTracker({ ip: "172.18.0.5", headers }, HEADER)).toBe("ip:unknown");
  });

  it("ne confond pas une IP absente avec un acteur", () => {
    expect(actorTracker({}, undefined)).toBe("ip:unknown");
  });
});
