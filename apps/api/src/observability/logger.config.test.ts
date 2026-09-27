import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pinoHttp } from "pino-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLogTargets, loggerOptions } from "./logger.config";

/**
 * Les lignes que pino-http écrit VRAIMENT, pour une vraie requête HTTP. Seul le transport est
 * remplacé — un worker thread qui écrirait sur stdout — par un flux qui les garde en mémoire.
 * Lire la valeur des options ne prouverait rien : c'est la ligne produite qui part sur le NAS et
 * dans Axiom (même leçon que #335).
 */
let lines: Record<string, unknown>[];
let server: Server;

async function request(path: string, init: RequestInit & { onRequest?: "log" } = {}) {
  const { transport: _stdoutWorker, ...options } = loggerOptions();
  const logger = pinoHttp(options, { write: (line: string) => lines.push(JSON.parse(line)) });
  server = createServer((req, res) => {
    logger(req, res);
    if (init.onRequest === "log") req.log.info("pendant la requête");
    res.setHeader("set-cookie", "better-auth.session_token=cookie-de-reponse; HttpOnly");
    res.setHeader("location", "https://app.test/reset-password?token=jeton-de-redirection");
    res.statusCode = 302;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual", ...init });
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

  it("journalise en info en production, en debug ailleurs", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(loggerOptions().level).toBe("info");

    vi.stubEnv("NODE_ENV", "development");
    expect(loggerOptions().level).toBe("debug");
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
});
