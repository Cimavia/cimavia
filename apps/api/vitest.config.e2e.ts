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
      // Object storage désactivé en e2e : on teste le fail-closed (503), sans dépendre du
      // .env local du dev (MinIO) ni exiger un bucket en CI. process.env prime sur le
      // fichier .env lu par ConfigModule → ces valeurs vides gagnent.
      S3_ENDPOINT: "",
      S3_REGION: "",
      S3_BUCKET: "",
      S3_ACCESS_KEY_ID: "",
      S3_SECRET_ACCESS_KEY: "",
      S3_FORCE_PATH_STYLE: "",
    },
  },
});
