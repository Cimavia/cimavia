import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/nestjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sentryOptions } from "./sentry.config";

/**
 * Ce qui serait parti chez Sentry. Le transport est la SEULE pièce remplacée : le vrai `init`
 * reçoit les options de `sentryOptions`, si bien que l'intégration HTTP, `requestData`,
 * `beforeSend` et la construction de l'enveloppe s'exécutent comme sur le NAS. Lire l'option ne
 * prouve rien — c'est ainsi que la fuite du jeton a tenu côté web (#335).
 */
const sent: Sentry.Event[] = [];
let server: Server;
let origin: string;

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
    profilesSampleRate: 0,
    transport: () => ({
      send: async ([, items]) => {
        for (const [header, payload] of items) {
          if (header.type === "event" || header.type === "transaction") {
            sent.push(payload as Sentry.Event);
          }
        }
        return {};
      },
      flush: async () => true,
    }),
  });

  // Une route qui LIT le corps, comme Better Auth, puis lève : le pire cas pour la capture.
  server = createServer((req, res) => {
    req.on("data", () => undefined);
    req.on("end", () => {
      if (req.url?.startsWith("/boom")) Sentry.captureException(new Error("boom"));
      res.setHeader(
        "set-cookie",
        `better-auth.session_token=${secret("cookie-de-reponse")}; HttpOnly`,
      );
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await Sentry.close();
});

beforeEach(() => {
  sent.length = 0;
});

async function hit(path: string, init: RequestInit = {}) {
  await fetch(`${origin}${path}`, { ...init, headers: { ...SECRET_HEADERS, ...init.headers } });
  await Sentry.flush(2000);
}

describe("sentryOptions — ce que Sentry reçoit vraiment", () => {
  it("n'envoie ni le mot de passe, ni la session, ni les en-têtes secrets d'une erreur", async () => {
    await hit("/boom/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "coach@test.fr", password: secret("mot-de-passe-secret") }),
    });

    const error = sent.find((event) => event.exception);
    expect(error).toBeDefined();
    const written = JSON.stringify(sent);
    // Le suffixe seul suffit : aucun secret de ce test ne doit apparaître, quel que soit le champ.
    expect(written).not.toContain(RUN);
    // Le reste de la requête part toujours : c'est ce qui la rend diagnosticable (#183).
    expect(error?.request).toMatchObject({
      method: "POST",
      url: `${origin}/boom/api/auth/sign-in/email`,
      headers: expect.objectContaining({
        "content-type": "application/json",
        referer: "https://app.test/reset-password?token=[Filtered]",
      }),
    });
    expect(error?.request?.data).toBeUndefined();
    expect(error?.request?.cookies).toBeUndefined();
  });

  it("n'envoie pas le jeton du lien de réinitialisation, ni dans l'erreur ni dans la transaction", async () => {
    await hit(
      `/boom/api/auth/reset-password/${secret("jeton-de-reset")}?callbackURL=%2Freset-password`,
    );

    // Les DEUX types d'événement : une transaction échantillonnée porte l'URL sans qu'aucune
    // erreur ne soit levée — nom, `http.target`, `http.url`, `url.full`.
    expect(sent.map((event) => event.type ?? "error").sort()).toEqual(["error", "transaction"]);
    expect(JSON.stringify(sent)).not.toContain(RUN);
    const transaction = sent.find((event) => event.type === "transaction");
    expect(transaction?.transaction).toBe("GET /boom/api/auth/reset-password/[Filtered]");
  });

  it("n'envoie pas le jeton d'appareil d'une révocation, même sans erreur", async () => {
    await hit(`/me/push-tokens/ExponentPushToken%5B${secret("jeton-appareil")}%5D`, {
      method: "DELETE",
    });

    expect(sent.map((event) => event.type)).toEqual(["transaction"]);
    expect(JSON.stringify(sent)).not.toContain(RUN);
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
});
