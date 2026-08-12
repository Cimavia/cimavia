import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DISPOSABLE_SUFFIX = "_e2e";

/**
 * La suite TRUNCATE toutes les tables à l'ouverture. Il suffit d'un `.env.test` absent et d'un
 * `DATABASE_URL` traînant dans le shell — ou d'un job CI qui en injecte un — pour qu'elle vide la
 * base de dev ou Neon. Le nom de base doit donc annoncer qu'elle est jetable, et on le vérifie
 * AVANT la première requête (migrate deploy compris), pas dans un commentaire.
 *
 * Ne jamais faire figurer l'URL dans le message : elle porte les identifiants, et ce message
 * finira dans les logs d'un runner.
 */
function assertDisposableDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error(
      "DATABASE_URL absent. Les e2e attendent une base jetable — copier apps/api/.env.test.example vers apps/api/.env.test.",
    );
  }

  const database = new URL(url).pathname.replace(/^\//, "");
  if (!database.endsWith(DISPOSABLE_SUFFIX)) {
    throw new Error(
      `Refus de lancer les e2e : la base « ${database} » ne finit pas par « ${DISPOSABLE_SUFFIX} ». ` +
        "Cette suite TRUNCATE toutes les tables — elle ne doit viser ni la base de dev ni Neon. " +
        "Base attendue : celle de docker-compose.test.yml (port 5434).",
    );
  }
}

// Applique le schéma Prisma à la DB e2e avant la suite. DATABASE_URL (e2e) est déjà dans
// l'env → prisma.config.ts (qui charge .env) ne l'écrase pas (loadEnvFile ne surcharge pas).
export default function setup() {
  assertDisposableDatabase(process.env.DATABASE_URL);

  const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  execSync("prisma migrate deploy", { cwd: apiDir, stdio: "inherit", env: process.env });
}
