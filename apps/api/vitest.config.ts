import { defineConfig } from "vitest/config";

/**
 * Tests UNITAIRES de l'API. Les e2e ont leur propre config (`vitest.config.e2e.ts`) : ils lancent
 * un vrai Nest sur une base dédiée et ne remontent PAS de couverture — l'instrumenter demanderait
 * de couvrir un process séparé. Conséquence assumée : la couverture affichée ici est celle des
 * unités pures, pas celle du parcours HTTP (que les 111 e2e couvrent, eux, sans le mesurer).
 */
export default defineConfig({
  test: {
    exclude: ["node_modules/**", "dist/**", "test/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      all: true,
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
