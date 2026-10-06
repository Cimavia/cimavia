import type { PluginOption } from "vite";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * Hors production, le plugin du routeur ajoute à CHAQUE fichier de `src/routes/` un bloc
 * `if (import.meta.hot) { … }`, absent du source. v8 le rattache à la dernière ligne du fichier :
 * le lcov y comptait une ligne et trois conditions jamais couvertes par route, que Sonar lit comme
 * du code non testé (#508). Le rechargement à chaud n'a aucun sens sous Vitest : ce plugin-là, et
 * lui seul, est retiré — le générateur de l'arbre de routes reste en place.
 */
const ROUTER_HMR_PLUGIN = "tanstack-router:hmr";

// `false` et non un retrait : c'est la valeur que Vite ignore, à toute profondeur de tableau.
function withoutRouterHmr(option: PluginOption): PluginOption {
  if (Array.isArray(option)) return option.map(withoutRouterHmr);
  const isRouterHmr =
    option != null &&
    typeof option === "object" &&
    "name" in option &&
    option.name === ROUTER_HMR_PLUGIN;
  return isRouterHmr ? false : option;
}

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
  { ...viteConfig, plugins: [withoutRouterHmr(viteConfig.plugins ?? [])] },
  defineConfig({
    test: {
      /**
       * `jsdom` et non `node` : les hooks et les composants montés par `@testing-library/react`
       * ont besoin d'un document. Les utils purs — les seuls testés jusqu'ici — n'y perdent qu'un
       * coût de démarrage, payé une fois par fichier.
       */
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      // À Paris et non dans le fuseau de la machine (#382) : sous l'UTC des runners, « aujourd'hui »
      // en UTC et « aujourd'hui » pour le lecteur se confondent, et l'écart de #321 passe inaperçu.
      env: { TZ: "Europe/Paris" },
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
          // `app.tsx` en est la seconde moitié, importée par `main.tsx` une fois `config.js`
          // vérifié (#417) : le routeur complet, que chaque test d'écran monte déjà à sa façon.
          "src/main.tsx",
          "src/app.tsx",
          // Barils de réexport : aucune branche à couvrir (même exclusion qu'@cmv/shared).
          "src/**/index.ts",
        ],
      },
    },
  }),
);
