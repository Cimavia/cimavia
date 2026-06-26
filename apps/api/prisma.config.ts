import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma 7 ne charge plus .env automatiquement : on le charge ici (Node >=22).
// En CI/prod, DATABASE_URL vient des vraies variables d'env → pas de .env, on saute.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
