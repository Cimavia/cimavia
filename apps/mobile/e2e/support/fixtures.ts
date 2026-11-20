import { type Account, PASSWORD, Seed } from "@cmv/e2e/seed";
import { test as base } from "@playwright/test";
import { API_URL } from "./env";
import { label } from "./i18n";
import { runFlow } from "./maestro";

/** Joue un flux de `e2e/flows/` sur l'appareil, avec ses variables. */
type Flow = (flow: string, vars: Record<string, string>) => Promise<void>;

/**
 * Le `test` des parcours : un jeu de données propre à chaque test, posé par l'API, dont les
 * sessions HTTP se ferment avec lui. Pas de navigateur : l'écran, c'est Maestro (`flow`).
 */
export const test = base.extend<{ seed: Seed; flow: Flow }>({
  seed: async ({ playwright }, use) => {
    const seed = new Seed(playwright.request, {
      apiUrl: API_URL,
      seriesName: label("block.preset.series"),
    });
    await use(seed);
    await seed.dispose();
  },
  // Le flux meurt avec son test. Un test expiré, Playwright passe à la relance ou au suivant : un
  // Maestro resté vivant y piloterait encore l'appareil, deux flux sur un écran.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright exige un premier argument déstructuré.
  flow: async ({}, use, testInfo) => {
    const controller = new AbortController();
    await use((flow, vars) => runFlow(testInfo, flow, vars, controller.signal));
    controller.abort();
  },
});

export { expect } from "@playwright/test";

/** Ce que le sous-flux `common/login.yaml` attend : le compte, et les libellés de l'écran. */
export function loginVars(account: Account): Record<string, string> {
  return {
    EMAIL: account.email,
    PASSWORD,
    EMAIL_LABEL: label("common.email"),
    PASSWORD_LABEL: label("common.password"),
    LOGIN_SUBMIT: label("auth.login.submit"),
  };
}
