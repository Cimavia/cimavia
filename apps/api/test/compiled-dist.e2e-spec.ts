import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * L'API COMPILÉE, telle que l'image la lance (`node dist/main.js`) — #671.
 *
 * Tout le reste de la suite importe Nest sous Vitest, donc en ESM natif. La production, elle,
 * compile en CommonJS et charge Nest 12, publié en ESM seulement, par `require(esm)` ; `nestjs-cls`
 * et `nestjs-pino` y prennent leur build CommonJS, et l'instrumentation Nest de Sentry doit
 * atteindre `@nestjs/core` par ses hooks de chargement. Une version de Node, de Nest ou de Sentry
 * qui casserait ce chemin ferait disparaître gardes et intercepteurs des traces sans une erreur :
 * seul ce fichier le verrait avant le NAS.
 *
 * Le `dist` est construit par Turbo avant la suite (`apps/api/turbo.json`), qui le reconstruit
 * quand le CONTENU de `src/` change — comme le `dist` de `@cmv/shared` dont dépend toute la suite.
 *
 * `NODE_ENV=test`, comme le reste de la suite, et non `production` : la production n'échantillonne
 * que 10 % des traces, et le test deviendrait aléatoire. Ses branches à elle — transport
 * `pino/file`, `/docs` fermé — sont celles que la sonde d'`api-image.yml` démarre sur `main`.
 */

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = join(API_ROOT, "dist", "main.js");

/** Un span tel qu'il part, dans le conteneur d'un item `span`. */
type WireSpan = { name: string; attributes: Record<string, { value: unknown }> };

const spans: WireSpan[] = [];
const output: string[] = [];
let sink: Server | undefined;
let api: ChildProcess | undefined;
let origin: string;
let cwd: string | undefined;

/**
 * Un port libre, que le système vient d'attribuer puis de rendre. Un autre processus peut le
 * prendre entre-temps : l'API s'arrêterait alors sur `EADDRINUSE`, que `beforeAll` affiche.
 */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => done(port));
    });
    probe.on("error", fail);
  });
}

/**
 * Le faux Sentry : il garde les spans de chaque enveloppe. Une enveloppe est une suite de lignes
 * JSON — en-tête, puis en-tête et contenu de chaque item ; un conteneur de spans porte `items`.
 */
function startSink(): Promise<string> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const text = (
        request.headers["content-encoding"] === "gzip" ? gunzipSync(body) : body
      ).toString();
      for (const line of text.split("\n")) {
        try {
          const parsed = JSON.parse(line) as { items?: unknown };
          if (Array.isArray(parsed.items)) spans.push(...(parsed.items as WireSpan[]));
        } catch {
          // Une ligne qui n'est pas du JSON (un profil binaire) ne porte pas de span.
        }
      }
      response.writeHead(200).end("{}");
    });
  });
  sink = server;
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      done(`http://clef@127.0.0.1:${(server.address() as AddressInfo).port}/1`);
    }),
  );
}

/**
 * Attend que `/health` réponde, ou que l'API s'arrête — alors tout de suite, avec ce qu'elle a
 * écrit. Une boucle et non `vi.waitFor` : il ne se laisse pas interrompre, et continuerait de
 * sonder un processus mort jusqu'à son délai.
 */
async function waitUntilHealthy(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (child.exitCode === null && child.signalCode === null) {
    const health = await fetch(`${origin}/health`).catch(() => null);
    if (health?.status === 200) return;
    if (Date.now() > deadline)
      throw new Error(`dist/main.js muet après 45 s :\n${output.join("")}`);
    await sleep(250);
  }
  throw new Error(
    `dist/main.js s'est arrêté (${child.exitCode ?? child.signalCode}) :\n${output.join("")}`,
  );
}

/** Les requêtes qui traversent toute la chaîne de Nest : session, gardes, CLS, extension, filtre. */
async function exerciseApi() {
  const email = `dist-${randomUUID()}@cmv.test`;
  const signUp = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: email,
      email,
      password: "password123",
      isCoach: true,
      isAthlete: false,
    }),
  });
  const cookie = signUp.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const plans = await fetch(`${origin}/plans`, { headers: { cookie } });
  // Sans session : l'AuthGuard refuse, et le filtre d'exception voit passer la 401.
  const anonymous = await fetch(`${origin}/plans`);
  return { signUp: signUp.status, plans: plans.status, body: await plans.json(), anonymous };
}

function spanNamed(name: string, spanOrigin: string) {
  return vi.waitFor(
    () => {
      const span = spans.find(
        (candidate) =>
          candidate.name === name && candidate.attributes["sentry.origin"]?.value === spanOrigin,
      );
      if (!span) throw new Error(`aucun span « ${name} » (${spanOrigin}) n'est parti`);
      return span;
    },
    // Les spans partent en flux, par lots : le premier peut attendre son envoi quelques secondes.
    { timeout: 20_000, interval: 250 },
  );
}

beforeAll(async () => {
  expect(existsSync(MAIN), "dist/ absent : lancer `pnpm turbo test:e2e`, qui le construit").toBe(
    true,
  );

  const dsn = await startSink();
  origin = `http://127.0.0.1:${await freePort()}`;
  // Un dossier VIDE comme répertoire courant : ni `instrument.ts` ni `ConfigModule` n'y trouvent
  // de `.env`. Celui du poste porterait le DSN et le jeton Axiom de développement — le test
  // enverrait ses traces et ses journaux pour de vrai. L'image n'en a pas non plus.
  cwd = mkdtempSync(join(tmpdir(), "cmv-dist-"));
  const child = spawn(process.execPath, [MAIN], {
    cwd,
    env: {
      ...process.env,
      PORT: new URL(origin).port,
      BETTER_AUTH_URL: origin,
      SENTRY_DSN: dsn,
      AXIOM_TOKEN: "",
      AXIOM_DATASET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api = child;
  child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitUntilHealthy(child);
});

afterAll(async () => {
  // Chaque ressource n'existe que si `beforeAll` est allé jusqu'à elle.
  if (api?.exitCode === null && api.signalCode === null) {
    const child = api;
    const exited = new Promise((done) => child.once("exit", done));
    child.kill("SIGTERM");
    // Un arrêt qui pend ne doit pas laisser l'API tenir le port et la base des suites suivantes.
    if ((await Promise.race([exited, sleep(10_000, "pendu")])) === "pendu") {
      child.kill("SIGKILL");
      await exited;
    }
  }
  const server = sink;
  if (server) await new Promise((done) => server.close(done));
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe("dist/main.js — l'API compilée en CommonJS", () => {
  it("sert une lecture scopée : la session, le CLS et l'extension Prisma tiennent", async () => {
    const result = await exerciseApi();

    expect([200, 201]).toContain(result.signUp);
    expect(result.plans).toBe(200);
    expect(result.body).toEqual([]);
    expect(result.anonymous.status).toBe(401);
  });

  it("instrumente Nest dans Sentry : démarrage, gardes, intercepteur et filtre", async () => {
    await exerciseApi();

    await spanNamed("Create Nest App", "auto.http.nestjs");
    await spanNamed("AuthGuard", "auto.middleware.nestjs.guard");
    await spanNamed("CapabilitiesGuard", "auto.middleware.nestjs.guard");
    await spanNamed("TenancyInterceptor", "auto.middleware.nestjs.interceptor");
    await spanNamed("SentryExceptionFilter", "auto.middleware.nestjs.exception_filter");
  });
});
