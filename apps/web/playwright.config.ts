import { envSchema } from "@cmv/shared";
import { defineConfig, devices } from "@playwright/test";
import { API_PORT, API_URL, DATABASE_URL, WEB_PORT, WEB_URL } from "./e2e/support/env";

const CI = process.env.CI != null;

/**
 * Toutes les variables que l'API lit, posées VIDES. `ConfigModule` et `instrument.ts` chargent
 * `apps/api/.env` pour toute variable que le process ne pose pas : sur un poste, l'API de test
 * partirait sinon avec le DSN Sentry, le jeton Axiom et le SMTP du développeur. Une variable vide
 * l'emporte sur le fichier, et le schéma la lit comme absente.
 *
 * Tirées du schéma, pas listées à la main : une variable ajoutée à l'API est neutralisée ici sans
 * que personne ait à y penser.
 */
const BLANK_ENV = Object.fromEntries(Object.keys(envSchema.shape).map((key) => [key, ""]));

/** Ce que l'API de test pose vraiment, par-dessus. Aucun secret : rien ne survit à la suite. */
const API_ENV: Record<string, string> = {
  ...BLANK_ENV,
  NODE_ENV: "test",
  APP_ENV: "development",
  PORT: String(API_PORT),
  DATABASE_URL,
  BETTER_AUTH_SECRET: "test-secret-not-for-production-0123456789abcdef",
  BETTER_AUTH_URL: API_URL,
  CORS_ORIGINS: WEB_URL,
  // Les parcours inscrivent leurs comptes sans invitation, comme la suite d'isolation. Sans storage
  // (`S3_*` vides), l'API démarre et ses routes médias répondent 503 : aucun parcours n'en a besoin.
  SIGNUP_MODE: "open",
};

/** Même principe côté web : `/config.js` lit `apps/web/.env`, et le build lirait un jeton Sentry. */
const WEB_ENV: Record<string, string> = {
  CMV_API_URL: API_URL,
  CMV_APP_ENV: "development",
  CMV_SENTRY_DSN: "",
  SENTRY_AUTH_TOKEN: "",
};

/**
 * Les parcours du Coach dans un vrai navigateur, contre une vraie API (#627). Les tests de rendu
 * simulent l'API ; les e2e de l'API n'ont pas de navigateur. Ce qui les relie — routage, cookie de
 * session, cache TanStack Query, rendu réel — ne se vérifie qu'ici.
 */
export default defineConfig({
  testDir: "./e2e",
  // `-spec` et non `.spec` : le motif par défaut de Vitest ramasserait un `*.spec.ts`.
  testMatch: "**/*.e2e-spec.ts",
  // Une API, une base : les parcours ne se gênent pas (chacun inscrit ses propres comptes), mais un
  // seul worker garde l'ordre des requêtes lisible dans une trace.
  workers: 1,
  forbidOnly: CI,
  // Un essai de plus en CI, et le rapport dit « flaky » : le flake se voit sans faire rougir le job.
  retries: CI ? 1 : 0,
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    locale: "fr-FR",
    // Le fuseau du lecteur, pas celui du runner (#382) : « aujourd'hui » s'y calcule.
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /**
   * JAMAIS de réutilisation d'un serveur déjà là : une API restée sur son port tournerait sur du
   * code périmé, et un web sur ce port pourrait viser l'API de dev. Le port pris fait échouer la
   * suite en le nommant, ce qui vaut mieux qu'un parcours qui teste autre chose que ce qu'il croit.
   */
  webServer: [
    {
      // La base d'abord : l'API ne démarre que sur une base créée, migrée et vidée. Puis le build
      // par Turbo, qui construit `@cmv/shared` d'abord — l'API le lit depuis son `dist`.
      command:
        "node ../web/e2e/prepare-database.mjs && pnpm turbo build --filter=@cmv/api --output-logs=errors-only && node dist/main.js",
      cwd: "../api",
      url: `${API_URL}/health`,
      env: API_ENV,
      reuseExistingServer: false,
      timeout: 180_000,
      // Les logs de l'API dans ceux du job : sans eux, un 500 du jeu de données n'a ni pile ni
      // contexte. En local, ils noieraient la sortie du reporter.
      stdout: CI ? "pipe" : "ignore",
    },
    {
      // Le bundle de PRODUCTION, servi par `vite preview` : ce que nginx sert, pas le serveur de dev.
      command: `pnpm exec vite build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      env: WEB_ENV,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
