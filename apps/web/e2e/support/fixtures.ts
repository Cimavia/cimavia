import { test as base } from "@playwright/test";
import { Seed } from "./seed";

/**
 * Le `test` des parcours : celui de Playwright, plus un jeu de données propre à chaque test, dont
 * les sessions HTTP se ferment avec lui.
 */
export const test = base.extend<{ seed: Seed }>({
  seed: async ({ playwright }, use) => {
    const seed = new Seed(playwright.request);
    await use(seed);
    await seed.dispose();
  },
});

export { expect } from "@playwright/test";
