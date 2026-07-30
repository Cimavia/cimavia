import { defineConfig } from "vitest/config";

/**
 * La couverture est produite à CHAQUE `pnpm test` (pas derrière un script séparé) : c'est le
 * rapport lu par SonarCloud, et un rapport qu'on oublie de générer vaut zéro pour la Quality Gate.
 *
 * `all: true` compte aussi les fichiers qu'aucun test n'importe — sans quoi un module non testé
 * disparaît du calcul au lieu d'y peser, et la couverture ment par omission.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      all: true,
      include: ["src/**/*.ts"],
      // Barils de réexport et schémas Zod : pas de branche à couvrir, seulement du bruit.
      exclude: ["src/index.ts", "src/**/*.test.ts", "src/type/**"],
    },
  },
});
