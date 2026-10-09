import { fileURLToPath } from "node:url";

/**
 * Mutation testing de la tenancy (#626) : l'extension Prisma qui scope chaque requête à l'acteur
 * courant (règle dure n°1), l'interceptor qui pose cet acteur, et le décorateur qui dit à quel titre
 * une route l'exerce. Un mutant qui survit ici est un filtre qu'on pourrait retirer sans qu'aucun
 * test ne le voie. La garde des capacités (`CapabilitiesGuard`) n'en est pas : elle répond 403, elle
 * ne scope rien.
 *
 * Le juge est la suite e2e (`vitest.config.mutation.ts`) : une base Postgres et un SILO réels, un
 * seul port. D'où `concurrency: 1`, et une durée (~30 min) qui la tient hors des PR. Elle tourne
 * dans le fuseau de la machine, comme le job `E2E` de la CI : le runner Vitest de Stryker impose
 * des threads, et un `TZ` posé ici changerait le fuseau de toute la suite, pas seulement le sien.
 */

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  // Stryker cherche ses plugins à côté de son propre paquet : sous pnpm, ce dossier ne contient que
  // ses dépendances à lui. Le runner se résout donc depuis ce paquet-ci, qui le déclare.
  plugins: [fileURLToPath(import.meta.resolve("@stryker-mutator/vitest-runner"))],
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.mutation.ts" },
  mutate: [
    "src/tenancy/**/*.ts",
    "!src/tenancy/**/*.test.ts",
    "!src/tenancy/tenancy.module.ts",
    "src/auth/decorator/require-capability.decorator.ts",
  ],
  coverageAnalysis: "perTest",
  // Une base, un SILO, un port 3001 : deux workers se marcheraient dessus.
  concurrency: 1,
  // Chaque passe reboote Nest et la connexion Prisma avant le premier test. Stryker compte un
  // Timeout comme un mutant TUÉ : avec la marge par défaut (5 s), une passe lente gonflerait le
  // score sans qu'aucune assertion n'ait rien vu.
  timeoutMS: 60_000,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  // Un survivant ici est un filtre tenant qu'on pourrait retirer sans que rien ne le voie : le seuil
  // ne descend pas. Un mutant que nul test ne peut tuer se déclare à sa ligne (« Tranché en #626 »).
  thresholds: { high: 100, low: 100, break: 100 },
};
