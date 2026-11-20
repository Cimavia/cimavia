import { testApiServer } from "@cmv/e2e/api-server";
import { defineConfig } from "@playwright/test";
import { API_PORT, APP_ORIGIN, DATABASE_URL } from "./e2e/support/env";

const CI = process.env.CI != null;

/**
 * Les parcours de l'Athlete dans la vraie app, contre une vraie API (#638). Les tests de rendu
 * simulent l'API ; les e2e de l'API n'ont pas d'écran. Ce qui les relie — navigation Expo Router,
 * session Better Auth dans SecureStore, cache TanStack Query, rendu natif — ne se vérifie qu'ici.
 *
 * Playwright n'ouvre AUCUN navigateur : il porte l'API de test, le seed de #627 et le rapport.
 * L'écran, c'est Maestro, que chaque test lance sur un flux YAML (`e2e/support/maestro.ts`).
 */
export default defineConfig({
  testDir: "./e2e",
  // `-spec` et non `.spec` : le motif par défaut de Vitest ramasserait un `*.spec.ts`.
  testMatch: "**/*.e2e-spec.ts",
  // Un seul appareil : deux flux en même temps s'y disputeraient l'écran.
  workers: 1,
  // Un flux Maestro relance l'app, se connecte et attend l'écran : bien plus qu'un test navigateur.
  timeout: 180_000,
  forbidOnly: CI,
  // Un essai de plus en CI, et le rapport dit « flaky » : le flake se voit sans faire rougir le job.
  retries: CI ? 1 : 0,
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/support/global-setup.ts",
  // L'origine que l'app présente à Better Auth est son scheme : seule l'API de test le reçoit.
  webServer: [
    testApiServer({ port: API_PORT, databaseUrl: DATABASE_URL, origins: [APP_ORIGIN], ci: CI }),
  ],
});
