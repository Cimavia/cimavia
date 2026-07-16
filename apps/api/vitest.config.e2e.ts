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
    minWorkers: 1,
    globalSetup: ["test/global-setup.e2e.ts"],
    // Propage l'env e2e aux workers (process séparés).
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "",
      PORT: process.env.PORT ?? "3001",
      // Origine navigateur fixée : le test de preflight CORS ne doit pas dépendre du .env local.
      CORS_ORIGINS: "http://localhost:5173",
      // Object storage : le MinIO du docker-compose, sur un bucket e2e dédié. Les e2e
      // dépendent déjà de ce compose (postgres_e2e) — le flux médias de P4 (upload signé,
      // rattachement, purge) ne serait pas couvert sans un storage réel.
      // Le fail-closed « API démarre sans storage → 503 » est couvert par le test unitaire
      // de StorageService (src/infra/storage/storage.service.test.ts).
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "cimavia-media-e2e",
      S3_ACCESS_KEY_ID: "cimavia",
      S3_SECRET_ACCESS_KEY: "cimavia_dev_secret",
      S3_FORCE_PATH_STYLE: "true",
    },
  },
});
