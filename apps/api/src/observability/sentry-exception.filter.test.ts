import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import * as Sentry from "@sentry/nestjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHttpAdapter } from "../app.setup";
import { sentryOptions } from "./sentry.config";
import { SentryExceptionFilter, sentryLevelOf } from "./sentry-exception.filter";

/**
 * Ce qui partirait chez Sentry : le vrai `init` (donc `pinoIntegration`, `beforeSend`), seul le
 * transport est remplacé. Lire l'appel à `captureException` ne prouverait ni le niveau, ni
 * l'empreinte, ni que les lignes de requête ne font pas doublon — même leçon que #335.
 */
const sent: Sentry.Event[] = [];
const logs: unknown[] = [];

@Controller()
class FailingController {
  @Get("refus/:id")
  refuse(@Param("id") id: string): never {
    throw new BadRequestException(`Refus numéro ${id}`);
  }

  @Get("absent/:id")
  absent(@Param("id") id: string): never {
    throw new NotFoundException(`Ressource ${id} introuvable`);
  }

  @Get("panne")
  panne(): never {
    throw new ServiceUnavailableException("Object storage non configuré");
  }

  @Get("bug")
  bug(): never {
    throw new TypeError("undefined n'est pas une fonction");
  }

  @Get("session")
  session(): never {
    throw new UnauthorizedException();
  }

  @Get("health/ready")
  ready(): never {
    throw new ServiceUnavailableException({ status: "degraded" });
  }
}

let app: NestFastifyApplication;
/** `res.err` tel que `pino-http` le lirait à la fin de la réponse, par chemin. */
const attached = new Map<string, unknown>();

beforeAll(async () => {
  Sentry.init({
    ...sentryOptions({ SENTRY_DSN: "https://clef@o0.ingest.sentry.io/1", NODE_ENV: "test" }),
    tracesSampleRate: 0,
    profileSessionSampleRate: 0,
    transport: () => ({
      send: async ([, items]) => {
        for (const [header, payload] of items) {
          if (header.type === "event") sent.push(payload as Sentry.Event);
          if (header.type === "log") logs.push(payload);
        }
        return {};
      },
      flush: async () => true,
    }),
  });

  const module = await Test.createTestingModule({
    controllers: [FailingController],
    providers: [{ provide: APP_FILTER, useClass: SentryExceptionFilter }],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(createHttpAdapter());
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onResponse", async (request, reply) => {
      attached.set(request.url, (reply.raw as { err?: unknown }).err);
    });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await Sentry.close();
});

beforeEach(() => {
  sent.length = 0;
  logs.length = 0;
  attached.clear();
});

async function get(url: string) {
  const response = await app.inject({ method: "GET", url });
  await Sentry.flush(2000);
  return response;
}

describe("SentryExceptionFilter — ce que Sentry reçoit vraiment", () => {
  it("envoie un refus (4xx) en warning, regroupé par statut et route déclarée", async () => {
    await get("/refus/a1");
    await get("/refus/b2");

    expect(sent).toHaveLength(2);
    for (const event of sent) {
      expect(event.level).toBe("warning");
      // Le motif de la route, pas l'URL : elle porte des identifiants, et un message français par
      // variante ferait sinon une issue par occurrence.
      expect(event.fingerprint).toEqual(["400", "GET /refus/:id"]);
    }
    expect(JSON.stringify(sent)).not.toContain("a1/");
  });

  it("sépare deux refus de statuts différents sur deux routes", async () => {
    await get("/refus/a1");
    await get("/absent/a1");

    expect(sent.map((event) => event.fingerprint)).toEqual([
      ["400", "GET /refus/:id"],
      ["404", "GET /absent/:id"],
    ]);
  });

  it("envoie une 5xx maîtrisée en error, ce que @SentryExceptionCaptured écartait", async () => {
    const response = await get("/panne");

    expect(response.statusCode).toBe(503);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.level).toBe("error");
    expect(sent[0]?.exception?.values?.[0]?.value).toBe("Object storage non configuré");
    // La pile distingue les sites d'où une panne est levée : pas d'empreinte imposée.
    expect(sent[0]?.fingerprint).toBeUndefined();
  });

  it("envoie une exception non HTTP en error, et la réponse reste une 500", async () => {
    const response = await get("/bug");

    expect(response.statusCode).toBe(500);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ level: "error" });
  });

  it("n'envoie rien pour un 401, session perdue au bout de sept jours", async () => {
    const response = await get("/session");

    expect(response.statusCode).toBe(401);
    expect(sent).toEqual([]);
  });

  it("n'envoie rien pour le 503 de la sonde de santé, qu'elle répète en boucle", async () => {
    const response = await get("/health/ready");

    expect(response.statusCode).toBe(503);
    expect(sent).toEqual([]);
  });

  it("dépose la vraie exception sur la réponse, pour la ligne de journal de la requête", async () => {
    await get("/panne");
    await get("/refus/a1");

    expect(attached.get("/panne")).toBeInstanceOf(ServiceUnavailableException);
    expect(attached.get("/refus/a1")).toBeInstanceOf(BadRequestException);
  });

  it("rend la même réponse qu'avant : le filtre de Nest en garde le rendu", async () => {
    const response = await get("/refus/a1");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ statusCode: 400, message: "Refus numéro a1" });
  });
});

describe("sentryLevelOf", () => {
  it.each([
    [400, "/x", "warning"],
    [404, undefined, "warning"],
    [500, "/x", "error"],
    [502, "/x", "error"],
    [503, "/storage", "error"],
    [401, "/x", null],
    [503, "/health/ready", null],
    [503, "/health", null],
    [503, "/healthcheck", "error"],
  ] as const)("%i sur %s → %s", (status, route, expected) => {
    expect(sentryLevelOf(status, route)).toBe(expected);
  });
});

describe("pinoIntegration — les erreurs avalées par un catch", () => {
  async function pinoLogger() {
    // Chargé APRÈS `Sentry.init`, comme `main.ts` : l'intégration instrumente `pino` au chargement.
    const { default: pino } = await import("pino");
    return pino({ level: "debug" }, { write: () => undefined });
  }

  it("fait d'un logger.error un événement, avec l'erreur sous err", async () => {
    const logger = await pinoLogger();

    logger.error({ err: new Error("push en panne"), userId: "u1" }, "Échec d'envoi");
    await Sentry.flush(2000);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ level: "error", logger: "pino" });
    expect(sent[0]?.exception?.values?.[0]?.value).toBe("push en panne");
  });

  it("garde le message d'un logger.error sans erreur attachée", async () => {
    const logger = await pinoLogger();

    logger.error({ userId: "u1", failures: 2 }, "Notifications push refusées par Expo");
    await Sentry.flush(2000);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.message).toBe("Notifications push refusées par Expo");
  });

  it("n'envoie ni les info, ni les warn, et aucun journal : Axiom reste le canal des journaux", async () => {
    const logger = await pinoLogger();

    logger.info("E-mail envoyé");
    logger.warn("refus");
    await Sentry.flush(2000);

    expect(sent).toEqual([]);
    expect(logs).toEqual([]);
  });

  it.each([
    "request errored",
    "request completed",
  ])("n'envoie pas la ligne « %s » de pino-http : le filtre a déjà capturé la même panne", async (message) => {
    const logger = await pinoLogger();

    logger.error({ err: new Error("failed with status code 503") }, message);
    await Sentry.flush(2000);

    expect(sent).toEqual([]);
  });
});
