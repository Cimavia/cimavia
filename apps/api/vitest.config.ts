import { defineConfig } from "vitest/config";

/**
 * Tests UNITAIRES de l'API. Le parcours HTTP est couvert par les 268 e2e, qui ont leur propre
 * config (`vitest.config.e2e.ts`) et remontent **aussi** leur couverture depuis #57 : ils lancent
 * un vrai Nest, mais dans le process du worker, que v8 mesure. Les deux lcov sont unis par Sonar.
 *
 * Le chiffre affiché ici (~3,5 %) ne décrit donc pas l'API, seulement ce que les unités pures
 * atteignent — ne pas en tirer de conclusion sans regarder `apps/api/coverage-e2e/`.
 */
export default defineConfig({
  test: {
    exclude: ["node_modules/**", "dist/**", "test/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      // `all: true` retiré : l'option n'existe plus en Vitest 4 (elle était ignorée en silence).
      // Le comportement qu'elle demandait — rapporter aussi les fichiers qu'aucun test n'importe —
      // est désormais celui d'`include`, et il compte : sans lui, un fichier jamais chargé
      // disparaîtrait du lcov, et Sonar le lirait comme 0 % plutôt que comme non couvert.
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/main.ts",
        "src/**/*.module.ts",
        "src/**/*.dto.ts",
        "src/generated/**",
      ],
    },
  },
});
