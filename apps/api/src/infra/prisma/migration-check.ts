import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { PrismaService } from "./prisma.service";

/**
 * Le dossier des migrations, trouvé depuis CE fichier et non depuis le dossier de lancement : une
 * API lancée d'ailleurs (`node apps/api/dist/main` depuis la racine) le chercherait au mauvais
 * endroit, et dirait à chaque démarrage « contrôle impossible ». `src/infra/prisma/` et
 * `dist/infra/prisma/` sont à la même profondeur sous `apps/api` (sous `/app` dans l'image).
 */
export const MIGRATIONS_DIR = resolve(__dirname, "../../../prisma/migrations");

/** Les noms commencent par un horodatage : l'ordre alphabétique est celui d'application. */
const byName = (a: string, b: string) => a.localeCompare(b, "en");

/** Une ligne de `_prisma_migrations`, la table où Prisma consigne ce qu'il a appliqué. */
export type AppliedMigration = {
  name: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
};

/**
 * Ce qui sépare la base du code (#212).
 *
 * - `pending` : écrite dans le code, jamais appliquée — la base est en retard.
 * - `failed` : commencée sans finir. `migrate deploy` refuse d'aller plus loin tant qu'elle n'est
 *   pas résolue à la main (`prisma migrate resolve`).
 * - `unknown` : appliquée, mais absente du code — la base est en AVANCE, le cas d'une image plus
 *   ancienne remise en service contre une base déjà migrée.
 */
export type MigrationDrift = {
  pending: string[];
  failed: string[];
  unknown: string[];
};

/**
 * Compare le dossier à la table, avec les règles de Prisma : une ligne `rolled_back_at` n'a jamais
 * eu lieu (la migration est à rejouer), une ligne sans `finished_at` est en échec. Un même nom peut
 * avoir plusieurs lignes — échouée, marquée annulée, puis rejouée : il suffit d'une réussite.
 */
export function migrationDrift(
  onDisk: readonly string[],
  applied: readonly AppliedMigration[],
): MigrationDrift {
  const live = applied.filter((row) => row.rolledBackAt == null);
  const done = new Set(live.filter((row) => row.finishedAt != null).map((row) => row.name));
  const failed = new Set(
    live.filter((row) => row.finishedAt == null && !done.has(row.name)).map((row) => row.name),
  );
  const disk = new Set(onDisk);
  return {
    pending: onDisk.filter((name) => !done.has(name) && !failed.has(name)),
    failed: [...failed].sort(byName),
    unknown: [...done].filter((name) => !disk.has(name)).sort(byName),
  };
}

/** Les migrations du code : un dossier par migration, `migration_lock.toml` exclu. Triées. */
export async function readMigrationsOnDisk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(byName);
}

/**
 * Les migrations de la base. Une base où Prisma n'a jamais rien appliqué n'a PAS la table : c'est
 * « rien d'appliqué », pas une panne — d'où le test d'existence avant de la lire.
 */
export async function readAppliedMigrations(prisma: PrismaService): Promise<AppliedMigration[]> {
  // biome-ignore lint/plugin/noRawSql: `_prisma_migrations` n'a pas de modèle Prisma ; ne lit qu'un nom de table
  const [table] = await prisma.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present`;
  if (table?.present !== true) return [];
  // biome-ignore lint/plugin/noRawSql: `_prisma_migrations` n'a pas de modèle Prisma ; table technique, aucune donnée d'un acteur
  const rows = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
  return rows.map((row) => ({
    name: row.migration_name,
    finishedAt: row.finished_at,
    rolledBackAt: row.rolled_back_at,
  }));
}
