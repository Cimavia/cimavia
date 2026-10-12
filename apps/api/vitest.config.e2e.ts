import { defineConfig } from "vitest/config";
import { currentWorktree, worktreeDatabaseUrl, worktreePort } from "./e2e-worktree";

// Charge .env.test dans le process principal (Node ≥22). loadEnvFile n'écrase PAS les vars
// déjà définies → DATABASE_URL e2e reste prioritaire même quand prisma.config.ts charge .env.
process.loadEnvFile(".env.test");

/**
 * Un worktree lié prend son port et sa base (#630) — le dépôt principal et la CI gardent ceux du
 * `.env.test`. Réécrits dans `process.env` et non dans le seul bloc `env` ci-dessous : le
 * `globalSetup` tourne dans CE process et migre la base qu'il y lit. Deux ports par suite :
 * `signup-mode.e2e-spec.ts` monte sa propre app sur `PORT + 1`.
 *
 * Une seule fois par environnement : la config se réévalue (mode watch, process enfants de Stryker,
 * qui héritent de l'environnement déjà décalé), et un second passage décalerait le port encore et
 * renommerait la base `…_wt_x_wt_x_e2e`. `CMV_E2E_WORKTREE` dit que c'est fait.
 */
const worktree = currentWorktree();
if (worktree != null && process.env.CMV_E2E_WORKTREE == null) {
  process.env.CMV_E2E_WORKTREE = worktree.name;
  const port = worktreePort(Number(process.env.PORT ?? 3001), worktree, 2);
  process.env.PORT = String(port);
  // Même origine que la `baseURL` du harnais (`test/support/app.ts`).
  process.env.BETTER_AUTH_URL = `http://localhost:${port}`;
  // Absent, il le reste : `globalSetup` refuse alors de démarrer, en disant quel fichier copier.
  const databaseUrl =
    process.env.DATABASE_URL && worktreeDatabaseUrl(process.env.DATABASE_URL, worktree);
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
  const database = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "absente";
  console.info(`e2e du worktree « ${worktree.name} » : port ${port}, base ${database}`);
}

export default defineConfig({
  test: {
    include: ["test/**/*.e2e-spec.ts"],
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Un seul worker séquentiel : la DB e2e est un état partagé (Vitest 4 : options à plat).
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: ["test/global-setup.e2e.ts"],
    // Les e2e démarrent Nest DANS le process du worker (`app.listen`) : les requêtes font un
    // aller-retour par la boucle locale, mais `src/` s'exécute ici. V8 relève donc les handlers
    // HTTP : ce rapport porte à lui seul ~93 % des lignes de l'API. Uni aux unitaires, il couvre
    // tout ce qu'une entrée peut atteindre ; ce qui reste est consigné en « Tranché en #512 ».
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "**/*.test.ts",
        "src/generated/**",
        // Bootstrap : les e2e passent par `Test.createTestingModule`, jamais par `main.ts`. Ces
        // lignes ne sont pas « non testées », elles sont hors d'atteinte de ce harnais — les
        // compter ferait mentir le chiffre autant que de les ignorer à tort.
        "src/main.ts",
        "src/instrument.ts",
      ],
      // Répertoire distinct de `coverage/` (tests unitaires) : Vitest nettoie son
      // `reportsDirectory` au démarrage, et l'un effacerait le rapport de l'autre.
      reportsDirectory: "coverage-e2e",
      reporter: ["text-summary", "lcov"],
    },
    // Propage l'env e2e aux workers (process séparés).
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "",
      PORT: process.env.PORT ?? "3001",
      // Origine navigateur fixée : le test de preflight CORS ne doit pas dépendre du .env local.
      CORS_ORIGINS: "http://localhost:5173",
      /**
       * Mode d'inscription (#263), fixé ici et non dans `.env.test` : c'est une VALEUR DE
       * FIXTURE. La suite d'isolation inscrit une centaine de comptes sans invitation — elle a
       * besoin d'un environnement ouvert, et le dire ici évite un `.env.test` qui aurait l'air
       * d'un réglage à choisir.
       *
       * Le mode FERMÉ a sa propre suite (`signup-mode.e2e-spec.ts`), qui pose la variable
       * elle-même avant de monter son app : les deux modes ne peuvent pas cohabiter dans une
       * seule instance, la politique étant lue au démarrage.
       */
      SIGNUP_MODE: "open",
      // Object storage : le SILO de `docker-compose.yml`, sur un bucket e2e dédié. La suite a donc
      // DEUX prérequis Docker — `docker-compose.test.yml` (la base e2e, port 5434) et ce SILO —
      // sans quoi le flux médias de P4 (upload signé, rattachement, purge) ne serait pas couvert.
      // Le fail-closed « API démarre sans storage → 503 » est couvert par le test unitaire
      // de StorageService (src/infra/storage/storage.service.test.ts).
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "cimavia-media-e2e",
      // La clé DÉDIÉE, pas le compte root du stockage (#267) : une permission oubliée dans sa policy
      // doit faire échouer la CI, pas se découvrir en panne sur le NAS. `silo-setup` la crée.
      S3_ACCESS_KEY_ID: "cimavia-api",
      S3_SECRET_ACCESS_KEY: "cimavia_dev_api_secret",
      S3_FORCE_PATH_STYLE: "true",
      /**
       * Secret du déclencheur de rappels (#47), fixé ici comme les `S3_*` : c'est une VALEUR DE
       * FIXTURE, pas un environnement — la mettre dans `.env.test` la ferait passer pour un
       * réglage à renseigner, alors que ce fichier n'a aucun trou à remplir.
       *
       * Sa présence est ce qui rend le chemin NOMINAL testable (le tick s'exécute). Le fail-closed
       * « secret absent → 503 » ne peut pas se tester ici, l'app e2e étant montée une fois pour
       * toute la suite : il est couvert par le test unitaire de `ReminderTickGuard`.
       */
      REMINDER_TICK_SECRET: "e2e-tick-secret-not-for-production",
    },
  },
});
