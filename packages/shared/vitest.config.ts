import { defineConfig } from "vitest/config";

/**
 * La couverture est produite à CHAQUE `pnpm test` (pas derrière un script séparé) : c'est le
 * rapport lu par SonarCloud, et un rapport qu'on oublie de générer vaut zéro pour la Quality Gate.
 *
 * Ce fichier est typechecké par `tsconfig.json` (#384) : sans quoi rien ne signalait `all: true`,
 * morte depuis Vitest 4 et ignorée en silence, que ce commentaire disait active.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      // `include` fait désormais ce que faisait `all` : rapporter aussi les fichiers qu'aucun test
      // n'importe. Sans lui, un module non testé disparaîtrait du lcov — et Sonar lit un fichier
      // absent comme 0 %, pas comme non mesuré (« Tranché en #57 »).
      include: ["src/**/*.ts"],
      // Chaque ligne a sa jumelle dans `sonar.coverage.exclusions`. Le baril de réexport n'a aucune
      // branche à couvrir. `src/type/**` n'y est plus : des types seuls ne produisent aucune ligne
      // dans le lcov, et un code exécutable qui y arriverait doit être mesuré.
      exclude: ["src/index.ts", "src/**/*.test.ts"],
    },
  },
});
