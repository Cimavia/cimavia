import { fileURLToPath } from "node:url";

/**
 * Mutation testing de `@cmv/shared` (#626) : Stryker altère le code (une borne, un opérateur, une
 * condition) et vérifie qu'un test au moins échoue. Un mutant qui survit est un comportement que
 * la couverture compte comme testé et qu'aucune assertion ne tient.
 *
 * Les tests tournent À PARIS (#382), mais le runner Vitest de Stryker impose `pool: "threads"` :
 * l'`env.TZ` de `vitest.config.ts` n'y change plus le fuseau, qui appartient au process. Il se pose
 * donc ici, avant que Stryker ne lance ses workers, qui en héritent.
 */
process.env.TZ = "Europe/Paris";

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  // Stryker cherche ses plugins à côté de son propre paquet : sous pnpm, ce dossier ne contient que
  // ses dépendances à lui. Le runner se résout donc depuis ce paquet-ci, qui le déclare.
  plugins: [fileURLToPath(import.meta.resolve("@stryker-mutator/vitest-runner"))],
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  mutate: ["src/**/*.ts", "!src/**/*.test.ts", "!src/index.ts"],
  coverageAnalysis: "perTest",
  // Seuls les mutants dont le code ou les tests ont changé repassent : c'est ce qui rend le job de
  // PR tenable. Le fichier est mis en cache par la CI, et ignoré par git.
  incremental: true,
  incrementalFile: "reports/mutation/stryker-incremental.json",
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  // Cliquet (« Tranché en #626 ») : le seuil suit le score mesuré, arrondi en dessous, et ne monte
  // qu'avec lui. Les survivants restants sont suivis en #635.
  thresholds: { high: 95, low: 85, break: 89 },
};
