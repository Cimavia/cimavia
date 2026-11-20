import { testApiServer } from "@cmv/e2e/api-server";
import { defineConfig, devices } from "@playwright/test";
import { API_PORT, API_URL, DATABASE_URL, WEB_PORT, WEB_URL } from "./e2e/support/env";

const CI = process.env.CI != null;

/**
 * Comme pour l'API (`testApiServer` les pose vides) : `/config.js` lit `apps/web/.env`, et le build
 * lirait un jeton Sentry.
 */
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
    // L'API de test : sa base préparée, puis le build de l'API, puis le serveur (`@cmv/e2e`).
    testApiServer({ port: API_PORT, databaseUrl: DATABASE_URL, origins: [WEB_URL], ci: CI }),
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
