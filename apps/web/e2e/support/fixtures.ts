import { Seed } from "@cmv/e2e/seed";
import { test as base } from "@playwright/test";
import { API_URL } from "./env";
import { SERIES_NAME } from "./seed";

/**
 * Le `test` des parcours : celui de Playwright, plus un jeu de données propre à chaque test, dont
 * les sessions HTTP se ferment avec lui.
 */
export const test = base.extend<{ seed: Seed }>({
  seed: async ({ playwright }, use) => {
    const seed = new Seed(playwright.request, { apiUrl: API_URL, seriesName: SERIES_NAME });
    await use(seed);
    await seed.dispose();
  },
});

export { expect } from "@playwright/test";
