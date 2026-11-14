import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authRequestLogger,
  buildLogTargets,
  loggerOptions,
  requestLogLevel,
  requestLogProps,
} from "./logger.config";

/**
 * Les lignes que pino-http écrit VRAIMENT, pour une vraie requête HTTP. Seul le transport est
 * remplacé — un worker thread qui écrirait sur stdout — par un flux qui les garde en mémoire.
 * Lire la valeur des options ne prouverait rien : c'est la ligne produite qui part sur le NAS et
 * dans Axiom (même leçon que #335).
 */
let lines: Record<string, unknown>[];
let server: Server;

async function request(
  path: string,
  init: RequestInit & {
    onRequest?: "log";
    status?: number;
    err?: Error;
    problemType?: string;
  } = {},
) {
  const { transport: _stdoutWorker, ...options } = loggerOptions();
  const logger = pinoHttp(options, { write: (line: string) => lines.push(JSON.parse(line)) });
  await serve(
    (req, res) => {
      logger(req, res);
      if (init.onRequest === "log") req.log.info("pendant la requête");
      res.setHeader("set-cookie", "better-auth.session_token=cookie-de-reponse; HttpOnly");
      res.setHeader("location", "https://app.test/reset-password?token=jeton-de-redirection");
      res.statusCode = init.status ?? 302;
      if (init.err) Object.assign(res, { err: init.err });
      if (init.problemType) Object.assign(res, { problemType: init.problemType });
      res.end();
    },
    path,
    { redirect: "manual", ...init },
  );
}

/**
 * Sert UNE requête, et attend sa ligne de fin : pino-http l'écrit à la fermeture de la réponse,
 * qui peut suivre sa réception par le client.
 */
async function serve(handler: RequestListener, path: string, init: RequestInit) {
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await fetch(`http://127.0.0.1:${port}${path}`, init);
  await vi.waitFor(() => expect(lines.some((line) => line.res)).toBe(true));
}

/** Les en-têtes qu'une requête authentifiée, ou le tick de rappels, envoie réellement. */
const SECRET_HEADERS = {
  cookie: "better-auth.session_token=cookie-de-session",
  authorization: "Bearer jeton-bearer",
  "x-cimavia-tick-secret": "secret-du-tick",
};

beforeEach(() => {
  lines = [];
});

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  vi.unstubAllEnvs();
});

describe("loggerOptions", () => {
  it("ne journalise ni cookie, ni authorization, ni secret du tick, ni set-cookie, ni location", async () => {
    await request("/api/auth/get-session", { headers: SECRET_HEADERS });

    const completed = lines.find((line) => line.msg === "request completed");
    const written = JSON.stringify(lines);
    for (const secret of [
      "cookie-de-session",
      "jeton-bearer",
      "secret-du-tick",
      "cookie-de-reponse",
      "jeton-de-redirection",
    ]) {
      expect(written).not.toContain(secret);
    }
    // Ce qui reste suffit au diagnostic : quelle requête, quelle issue, en combien de temps.
    expect(completed).toMatchObject({
      req: { id: expect.anything(), method: "GET", url: "/api/auth/get-session" },
      res: { statusCode: 302 },
      responseTime: expect.any(Number),
    });
    expect(Object.keys(completed?.req as object).sort()).toEqual(["id", "method", "url"]);
    expect(Object.keys(completed?.res as object)).toEqual(["statusCode"]);
  });

  it("blanchit le jeton du lien de réinitialisation, qui arrive dans le chemin", async () => {
    await request("/api/auth/reset-password/jeton-de-reset?callbackURL=%2Freset-password");

    expect(JSON.stringify(lines)).not.toContain("jeton-de-reset");
    expect(lines.at(-1)).toMatchObject({
      req: { url: "/api/auth/reset-password/[Filtered]?callbackURL=%2Freset-password" },
    });
  });

  it("blanchit le jeton d'appareil de la révocation", async () => {
    await request("/me/push-tokens/ExponentPushToken%5Bjeton-appareil%5D", { method: "DELETE" });

    expect(JSON.stringify(lines)).not.toContain("jeton-appareil");
    expect(lines.at(-1)).toMatchObject({
      req: { method: "DELETE", url: "/me/push-tokens/[Filtered]" },
    });
  });

  it("applique la même liste blanche aux lignes écrites pendant la requête", async () => {
    await request("/api/auth/reset-password/jeton-de-reset", {
      headers: SECRET_HEADERS,
      onRequest: "log",
    });

    const during = lines.find((line) => line.msg === "pendant la requête");
    expect(during?.req).toEqual({
      id: expect.anything(),
      method: "GET",
      url: "/api/auth/reset-password/[Filtered]",
    });
    expect(JSON.stringify(during)).not.toMatch(/cookie-de-session|secret-du-tick|jeton-de-reset/);
  });

  it.each([
    [200, "info", "request completed"],
    [302, "info", "request completed"],
    [401, "warn", "request completed"],
    [422, "warn", "request completed"],
    [503, "error", "request errored"],
  ])("écrit la ligne d'un %i au niveau %s, avec son statut", async (status, level, msg) => {
    await request("/x", { status });

    const line = lines.find((candidate) => candidate.msg === msg);
    expect(line).toMatchObject({ level: expect.any(Number), res: { statusCode: status } });
    expect(line?.level).toBe({ info: 30, warn: 40, error: 50 }[level as "info"]);
  });

  it("rattache la vraie exception à la ligne de la requête, au lieu de celle de pino-http", async () => {
    const cause = Object.assign(new Error("Object storage non configuré"), { status: 503 });

    await request("/x", { status: 503, err: cause });

    const line = lines.find((candidate) => candidate.msg === "request errored");
    expect(line?.err).toMatchObject({ message: "Object storage non configuré" });
    expect(JSON.stringify(line)).not.toContain("failed with status code");
  });

  it("garde la ligne d'un refus 401 : Sentry l'écarte, Axiom la conserve", async () => {
    await request("/me", { status: 401, err: new Error("Unauthorized") });

    expect(lines.find((line) => line.res)).toMatchObject({
      level: 40,
      res: { statusCode: 401 },
      err: { message: "Unauthorized" },
    });
  });

  it("ajoute le type du problème à la ligne : un 4xx se lit par sa cause", async () => {
    await request("/plans/p1", {
      status: 409,
      err: new Error("conflit"),
      problemType: "urn:cimavia:problem:stale-write",
    });

    expect(lines.find((line) => line.res)).toMatchObject({
      level: 40,
      problemType: "urn:cimavia:problem:stale-write",
    });
  });

  it("n'ajoute rien à la ligne d'une requête réussie", async () => {
    await request("/plans", { status: 200 });

    expect(lines.find((line) => line.res)).not.toHaveProperty("problemType");
  });

  it("journalise en info en production, en debug ailleurs", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(loggerOptions().level).toBe("info");

    vi.stubEnv("NODE_ENV", "development");
    expect(loggerOptions().level).toBe("debug");
  });
});

/**
 * Une connexion telle que Better Auth la sert : le middleware est appelé avec, pour `next`, le
 * handler qui répond — la session en `set-cookie` et dans le corps. La racine est un vrai logger
 * pino, comme celle de `nestjs-pino`, dont seul le flux est remplacé.
 */
async function signIn(status: number) {
  const root = pino({ level: "info" }, { write: (line: string) => lines.push(JSON.parse(line)) });
  const middleware = authRequestLogger(root);
  await serve(
    (req, res) => {
      middleware(req, res, () => {
        res.setHeader("set-cookie", "better-auth.session_token=session-de-reponse; HttpOnly");
        res.statusCode = status;
        res.end(JSON.stringify({ token: "session-de-reponse" }));
      });
    },
    "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: SECRET_HEADERS.cookie },
      body: JSON.stringify({ email: "coach@cmv.test", password: "mot-de-passe-secret" }),
    },
  );
}

describe("authRequestLogger", () => {
  it("écrit UNE ligne par connexion, sans mot de passe, ni adresse, ni session", async () => {
    await signIn(200);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      msg: "request completed",
      level: 30,
      req: { method: "POST", url: "/api/auth/sign-in/email" },
      res: { statusCode: 200 },
      responseTime: expect.any(Number),
    });
    expect(Object.keys(lines[0]?.req as object).sort()).toEqual(["id", "method", "url"]);
    expect(JSON.stringify(lines)).not.toMatch(
      /mot-de-passe-secret|coach@cmv\.test|cookie-de-session|session-de-reponse/,
    );
  });

  it("écrit un mot de passe faux en warn : une rafale de 401 se voit dans Axiom", async () => {
    await signIn(401);

    expect(lines).toEqual([expect.objectContaining({ level: 40, res: { statusCode: 401 } })]);
  });
});

describe("requestLogLevel", () => {
  it("passe en error une erreur que le serveur n'a pas rendue, même sous un statut 2xx", () => {
    expect(requestLogLevel({}, { statusCode: 200 }, new Error("flux coupé"))).toBe("error");
    expect(requestLogLevel({}, { statusCode: 404 }, new Error("absent"))).toBe("warn");
  });
});

describe("requestLogProps", () => {
  it("ne pose le type que si le filtre l'a déposé", () => {
    expect(requestLogProps({}, {})).toEqual({});
    expect(requestLogProps({}, { problemType: "about:blank" })).toEqual({
      problemType: "about:blank",
    });
  });
});

describe("buildLogTargets", () => {
  it("écrit du JSON brut sur stdout en production, et rien d'autre sans Axiom", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AXIOM_TOKEN", "");

    expect(buildLogTargets()).toEqual([{ target: "pino/file", options: { destination: 1 } }]);
  });

  it("passe par pino-pretty hors production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AXIOM_TOKEN", "");

    expect(buildLogTargets()).toEqual([{ target: "pino-pretty", options: { colorize: true } }]);
  });

  it("ajoute Axiom seulement quand le jeton ET le dataset sont posés", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AXIOM_TOKEN", "xaat-jeton");
    vi.stubEnv("AXIOM_DATASET", "");
    expect(buildLogTargets()).toHaveLength(1);

    vi.stubEnv("AXIOM_DATASET", "cimavia");
    expect(buildLogTargets()).toContainEqual({
      target: "@axiomhq/pino",
      options: { dataset: "cimavia", token: "xaat-jeton" },
    });
  });

  it("passe le domaine edge à Axiom quand AXIOM_EDGE est posé, et seulement alors", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AXIOM_TOKEN", "xaat-jeton");
    vi.stubEnv("AXIOM_DATASET", "cimavia");
    vi.stubEnv("AXIOM_EDGE", "");
    expect(buildLogTargets()[1]?.options).not.toHaveProperty("edge");

    vi.stubEnv("AXIOM_EDGE", "eu-central-1.aws.edge.axiom.co");
    expect(buildLogTargets()[1]?.options).toEqual({
      dataset: "cimavia",
      token: "xaat-jeton",
      edge: "eu-central-1.aws.edge.axiom.co",
    });
  });
});
