#!/usr/bin/env node
/**
 * La base des e2e web, mise au dernier schéma puis vidée — AVANT que l'API de test démarre.
 *
 * Pas un `globalSetup` Playwright : celui-ci tourne APRÈS les `webServer`. L'API démarrerait donc
 * sur une base que `migrate deploy` n'a pas encore créée, et le `TRUNCATE` passerait sous une API
 * vivante. La config l'enchaîne en tête de la commande de l'API, qui ne part qu'une fois la base
 * prête — et un poste sans conteneur échoue ici, avec la commande à lancer.
 *
 * En `.mjs`, comme les scripts de `scripts/` : Node l'exécute tel quel, sans chargeur TypeScript.
 * `DATABASE_URL` vient de l'environnement que la config pose sur la commande.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DISPOSABLE_SUFFIX = "_e2e";
const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../api");

/**
 * Toutes les tables du schéma, lues dans le catalogue plutôt que listées : une table ajoutée par une
 * migration est vidée sans que personne ait à y penser. `_prisma_migrations` reste, sans quoi le
 * `migrate deploy` suivant rejouerait tout l'historique sur des tables déjà là.
 */
const TRUNCATE_ALL = `
DO $$
DECLARE tables text;
BEGIN
  SELECT string_agg(format('%I', tablename), ', ') INTO tables
  FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
  IF tables IS NOT NULL THEN EXECUTE 'TRUNCATE ' || tables || ' CASCADE'; END IF;
END $$;
`;

/**
 * Même garde que les e2e de l'API (`apps/api/test/global-setup.e2e.ts`) : le nom de base doit
 * annoncer qu'elle est jetable. L'URL n'apparaît jamais dans le message, elle porte le mot de passe.
 */
function disposableDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL absent : la config Playwright le pose sur cette commande.");

  const database = new URL(url).pathname.replace(/^\//, "");
  if (!database.endsWith(DISPOSABLE_SUFFIX)) {
    throw new Error(
      `Refus de préparer la base « ${database} » : elle ne finit pas par « ${DISPOSABLE_SUFFIX} », ` +
        "et ce script en vide toutes les tables.",
    );
  }
  return url;
}

function prisma(args, input) {
  execFileSync("pnpm", ["exec", "prisma", ...args], {
    cwd: API_DIR,
    input,
    stdio: [input == null ? "inherit" : "pipe", "inherit", "inherit"],
  });
}

disposableDatabaseUrl();
try {
  // `migrate deploy` CRÉE la base si elle manque : un poste ou un runner neuf n'a rien à préparer
  // de plus que le conteneur. Pas de `migrate reset` : Prisma le refuse quand un agent le lance, et
  // ce verrou n'a pas à être contourné pour une base qu'un `TRUNCATE` vide aussi bien.
  prisma(["migrate", "deploy"]);
  prisma(["db", "execute", "--stdin"], TRUNCATE_ALL);
} catch {
  console.error(
    "Base e2e injoignable ou migration en échec. Le conteneur se lance par :\n" +
      "  docker compose -f apps/api/docker-compose.test.yml up -d --wait",
  );
  process.exit(1);
}
