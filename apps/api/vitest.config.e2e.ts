import { defineConfig } from "vitest/config";

// Charge .env.test dans le process principal (Node ≥22). loadEnvFile n'écrase PAS les vars
// déjà définies → DATABASE_URL e2e reste prioritaire même quand prisma.config.ts charge .env.
process.loadEnvFile(".env.test");

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
    // HTTP, ce qui fait passer la mesure de l'API de ~3,5 % à ~89 % sans écrire un test.
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
      // Object storage : le MinIO de `docker-compose.yml`, sur un bucket e2e dédié. La suite a donc
      // DEUX prérequis Docker — `docker-compose.test.yml` (la base e2e, port 5434) et ce MinIO —
      // sans quoi le flux médias de P4 (upload signé, rattachement, purge) ne serait pas couvert.
      // Le fail-closed « API démarre sans storage → 503 » est couvert par le test unitaire
      // de StorageService (src/infra/storage/storage.service.test.ts).
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "cimavia-media-e2e",
      S3_ACCESS_KEY_ID: "cimavia",
      S3_SECRET_ACCESS_KEY: "cimavia_dev_secret",
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
