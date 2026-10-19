import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/nestjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sentryOptions } from "./sentry.config";

/**
 * Ce qui serait parti chez Sentry. Le transport est la SEULE pièce remplacée : le vrai `init`
 * reçoit les options de `sentryOptions`, si bien que l'intégration HTTP, `requestData`,
 * `beforeSend`, `beforeSendSpan` et la construction de l'enveloppe s'exécutent comme sur le NAS.
 * Lire l'option ne prouve rien — c'est ainsi que la fuite du jeton a tenu côté web (#335).
 *
 * `wire` garde chaque item de l'enveloppe quel que soit son type, pour dire qu'aucun secret n'est
 * parti : un filtre sur les types connus a laissé passer sans bruit les spans streamés de la v11,
 * `referer` en clair compris (#669). `sent` et `spans` disent CE qui est parti.
 */
const wire: unknown[] = [];
const sent: Sentry.Event[] = [];
const spans: WireSpan[] = [];
let closeServer: (() => Promise<void>) | undefined;
let origin: string;

/** Un span tel qu'il part, dans le conteneur d'un item `span`. */
type WireSpan = {
  name: string;
  is_segment: boolean;
  attributes: Record<string, { value: unknown }>;
};

/**
 * Chaque secret porte un suffixe tiré à l'exécution. Sans lui, le test se trouverait lui-même :
 * les événements d'erreur embarquent les lignes de source autour du `captureException`
 * (ContextLines), et ces lignes contiennent les littéraux qu'on cherche.
 */
const RUN = randomUUID();
const secret = (name: string) => `${name}-${RUN}`;

const env = { SENTRY_DSN: "https://clef@o0.ingest.sentry.io/1", NODE_ENV: "test" };

/** Les en-têtes qu'une requête authentifiée, ou le tick de rappels, envoie réellement. */
const SECRET_HEADERS = {
  cookie: `better-auth.session_token=${secret("cookie-de-session")}`,
  authorization: `Bearer ${secret("jeton-bearer")}`,
  "x-cimavia-tick-secret": secret("secret-du-tick"),
  referer: `https://app.test/reset-password?token=${secret("jeton-du-referer")}`,
};

beforeAll(async () => {
  Sentry.init({
    ...sentryOptions(env),
    // Aucun profil : ils n'apportent rien au test et partiraient dans le même transport.
    profileSessionSampleRate: 0,
    transport: () => ({
      send: async ([, items]) => {
        for (const [header, payload] of items) {
          wire.push(payload);
          if (header.type === "event") sent.push(payload as Sentry.Event);
          if (header.type === "span") spans.push(...(payload as { items: WireSpan[] }).items);
        }
        return {};
      },
      flush: async () => true,
    }),
  });

  // Le serveur de l'API, chargé APRÈS `init` comme dans `main.ts`. Un serveur `node:http` nu ne
  // suffit plus : en v11, une erreur levée dans son `req.on("end")` perd la requête, ce que
  // Fastify ne fait pas — le test mesurerait un serveur que l'API n'a pas.
  const { createHttpAdapter } = await import("../app.setup");
  const app = createHttpAdapter().getInstance();
  app.addHook("onSend", async (_request, reply) => {
    reply.header(
      "set-cookie",
      `better-auth.session_token=${secret("cookie-de-reponse")}; HttpOnly`,
    );
  });
  // Une route qui LIT le corps, comme Better Auth, puis lève : le pire cas pour la capture.
  app.post("/api/auth/sign-in/email", async () => {
    Sentry.captureException(new Error("connexion"));
    return {};
  });
  app.get("/api/auth/reset-password/:token", async () => {
    Sentry.captureException(new Error("réinitialisation"));
    return {};
  });
  app.delete("/me/push-tokens/:token", async (_request, reply) => reply.code(204).send());
  await app.listen({ port: 0, host: "127.0.0.1" });
  origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  closeServer = () => app.close();
});

afterAll(async () => {
  // Absent si `beforeAll` a échoué avant l'écoute : son erreur suffit, inutile d'en ajouter une.
  await closeServer?.();
  await Sentry.close();
});

beforeEach(() => {
  wire.length = 0;
  sent.length = 0;
  spans.length = 0;
});

async function hit(path: string, init: RequestInit = {}) {
  await fetch(`${origin}${path}`, { ...init, headers: { ...SECRET_HEADERS, ...init.headers } });
  await Sentry.flush(2000);
}

/** Le span serveur de la requête — celui qui porte son URL. */
function serverSpan() {
  return spans.find((span) => span.attributes["sentry.op"]?.value === "http.server");
}

describe("sentryOptions — ce que Sentry reçoit vraiment", () => {
  it("n'envoie ni le mot de passe, ni la session, ni les en-têtes secrets d'une erreur", async () => {
    await hit("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "coach@test.fr", password: secret("mot-de-passe-secret") }),
    });

    const error = sent.find((event) => event.exception);
    expect(error).toBeDefined();
    // Le suffixe seul suffit : aucun secret de ce test ne doit apparaître, quel que soit le champ.
    expect(JSON.stringify(wire)).not.toContain(RUN);
    // Le reste de la requête part toujours : c'est ce qui la rend diagnosticable (#183).
    expect(error?.request).toMatchObject({
      method: "POST",
      url: `${origin}/api/auth/sign-in/email`,
      headers: expect.objectContaining({
        "content-type": "application/json",
        referer: "https://app.test/reset-password?token=[Filtered]",
      }),
    });
    expect(error?.request?.data).toBeUndefined();
    expect(error?.request?.cookies).toBeUndefined();
  });

  it("n'envoie pas le jeton du lien de réinitialisation, ni dans l'erreur ni dans les spans", async () => {
    await hit(`/api/auth/reset-password/${secret("jeton-de-reset")}?callbackURL=%2Freset-password`);

    // Les DEUX : un span échantillonné porte l'URL sans qu'aucune erreur ne soit levée.
    expect(sent).toHaveLength(1);
    expect(serverSpan()?.attributes["url.path"]?.value).toBe("/api/auth/reset-password/[Filtered]");
    expect(JSON.stringify(wire)).not.toContain(RUN);
  });

  it("n'envoie pas le jeton d'appareil d'une révocation, même sans erreur", async () => {
    await hit(`/me/push-tokens/ExponentPushToken%5B${secret("jeton-appareil")}%5D`, {
      method: "DELETE",
    });

    expect(sent).toEqual([]);
    expect(serverSpan()).toBeDefined();
    expect(JSON.stringify(wire)).not.toContain(RUN);
  });
});

describe("sentryOptions — réglages", () => {
  it("laisse le SDK inerte quand aucun DSN n'est configuré", () => {
    expect(sentryOptions({ SENTRY_DSN: "" })).toMatchObject({ enabled: false, dsn: undefined });
  });

  it("tague le tier de déploiement, et retombe sur development sans lui", () => {
    expect(sentryOptions({ APP_ENV: "preview" }).environment).toBe("preview");
    expect(sentryOptions({}).environment).toBe("development");
  });

  it("n'annonce une release qu'avec la version ET le build", () => {
    expect(sentryOptions({ APP_VERSION: "1.6.2", APP_BUILD: "3f2a1c" }).release).toBe(
      "1.6.2+3f2a1c",
    );
    expect(sentryOptions({ APP_VERSION: "1.6.2" }).release).toBeUndefined();
  });

  it("échantillonne 10 % des transactions en production, toutes ailleurs", () => {
    expect(sentryOptions({ NODE_ENV: "production" }).tracesSampleRate).toBe(0.1);
    expect(sentryOptions({ NODE_ENV: "development" }).tracesSampleRate).toBe(1);
  });

  it("profile chaque trace échantillonnée, sans attendre un démarrage manuel", () => {
    expect(sentryOptions({})).toMatchObject({
      profileSessionSampleRate: 1,
      profileLifecycle: "trace",
    });
  });
});
