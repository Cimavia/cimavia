import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * Harnais de test du web. Fusionné avec `vite.config.ts` plutôt que réécrit : les alias (`@/`,
 * `@cmv/shared`, `@cmv/tokens`) et le plugin React y vivent déjà. Les redéclarer ici créerait
 * deux tables d'alias qui divergeraient — et un test qui résout un module autrement que
 * l'application ne teste plus l'application.
 *
 * La couverture est produite à CHAQUE `pnpm test` et non derrière un script séparé (même règle
 * qu'@cmv/shared) : c'est le rapport lu par SonarCloud, et un rapport qu'on oublie de générer
 * vaut zéro pour la Quality Gate, pas « non mesuré ».
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      /**
       * `jsdom` et non `node` : les hooks et les composants montés par `@testing-library/react`
       * ont besoin d'un document. Les utils purs — les seuls testés jusqu'ici — n'y perdent qu'un
       * coût de démarrage, payé une fois par fichier.
       */
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text-summary", "lcov"],
        /**
         * `include`, et surtout pas `all` (retirée en Vitest 4, où elle était ignorée en silence).
         * Sans lui, un fichier qu'aucun test n'importe disparaîtrait du lcov — or un fichier
         * absent de tout lcov vaut **0 %** dans Sonar, pas « non mesuré » (« Tranché en #57 »).
         * Tout `src/` est donc mesuré, écrans et composants compris.
         */
        include: ["src/**/*.{ts,tsx}"],
        /**
         * Chaque ligne ci-dessous doit avoir son jumeau dans `sonar.coverage.exclusions`. Sortir
         * un fichier d'ICI seulement le ferait compter zéro au lieu de le retirer du calcul :
         * l'exclusion n'a de sens que symétrique.
         */
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/**/*.d.ts",
          // Réécrit par TanStackRouterVite à chaque build : personne ne le relit, rien à couvrir.
          "src/routeTree.gen.ts",
          // Bootstrap, jamais traversé par le harnais — l'équivalent web du `main.ts` de l'API.
          "src/main.tsx",
          // Barils de réexport : aucune branche à couvrir (même exclusion qu'@cmv/shared).
          "src/**/index.ts",
        ],
      },
    },
  }),
);
