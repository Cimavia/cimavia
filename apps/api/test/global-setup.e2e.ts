import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Applique le schéma Prisma à la DB e2e avant la suite. DATABASE_URL (e2e) est déjà dans
// l'env → prisma.config.ts (qui charge .env) ne l'écrase pas (loadEnvFile ne surcharge pas).
export default function setup() {
  const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  execSync("prisma migrate deploy", { cwd: apiDir, stdio: "inherit", env: process.env });
}
