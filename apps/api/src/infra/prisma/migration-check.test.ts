import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AppliedMigration,
  migrationDrift,
  readAppliedMigrations,
  readMigrationsOnDisk,
} from "./migration-check";
import type { PrismaService } from "./prisma.service";

const AT = new Date("2026-11-18T10:00:00Z");
const done = (name: string): AppliedMigration => ({ name, finishedAt: AT, rolledBackAt: null });
const failed = (name: string): AppliedMigration => ({ name, finishedAt: null, rolledBackAt: null });
const rolledBack = (name: string): AppliedMigration => ({
  name,
  finishedAt: null,
  rolledBackAt: AT,
});

describe("migrationDrift", () => {
  it("ne signale rien quand base et code concordent", () => {
    expect(migrationDrift(["a", "b"], [done("a"), done("b")])).toEqual({
      pending: [],
      failed: [],
      unknown: [],
    });
  });

  it("nomme les migrations du code jamais appliquées, dans l'ordre du dossier", () => {
    expect(migrationDrift(["a", "b", "c"], [done("a")]).pending).toEqual(["b", "c"]);
  });

  it("tient tout pour en attente sur une base vide", () => {
    expect(migrationDrift(["a", "b"], []).pending).toEqual(["a", "b"]);
  });

  it("dit en échec une migration commencée sans finir, et ne la compte pas en attente", () => {
    expect(migrationDrift(["a", "b"], [done("a"), failed("b")])).toEqual({
      pending: [],
      failed: ["b"],
      unknown: [],
    });
  });

  // `migrate resolve --rolled-back` marque l'échec comme n'ayant jamais eu lieu : à rejouer.
  it("tient une migration annulée pour en attente", () => {
    expect(migrationDrift(["a"], [rolledBack("a")]).pending).toEqual(["a"]);
  });

  it("tient pour appliquée une migration échouée, annulée puis rejouée", () => {
    expect(migrationDrift(["a"], [rolledBack("a"), done("a")])).toEqual({
      pending: [],
      failed: [],
      unknown: [],
    });
  });

  it("nomme ce que la base a appliqué et que le code ne connaît pas", () => {
    expect(migrationDrift(["a"], [done("a"), done("z"), done("y")]).unknown).toEqual(["y", "z"]);
  });
});

describe("readMigrationsOnDisk", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir != null) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("rend les dossiers triés, sans le fichier de verrou", async () => {
    dir = await mkdtemp(join(tmpdir(), "cmv-migrations-"));
    await mkdir(join(dir, "20260102_b"));
    await mkdir(join(dir, "20260101_a"));
    await writeFile(join(dir, "migration_lock.toml"), 'provider = "postgresql"');
    expect(await readMigrationsOnDisk(dir)).toEqual(["20260101_a", "20260102_b"]);
  });

  it("lève sur un dossier absent : l'appelant le dit, il ne conclut pas « rien à appliquer »", async () => {
    await expect(readMigrationsOnDisk(join(tmpdir(), "cmv-absent-"))).rejects.toThrow();
  });
});

describe("readAppliedMigrations", () => {
  const prismaWith = (...results: unknown[]) => {
    const queryRaw = vi.fn();
    for (const result of results) queryRaw.mockResolvedValueOnce(result);
    return { prisma: { $queryRaw: queryRaw } as unknown as PrismaService, queryRaw };
  };

  it("rend une liste vide sans lire la table quand elle n'existe pas", async () => {
    const { prisma, queryRaw } = prismaWith([{ present: false }]);
    expect(await readAppliedMigrations(prisma)).toEqual([]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rend les lignes de la table sous leurs noms de champ", async () => {
    const { prisma } = prismaWith(
      [{ present: true }],
      [{ migration_name: "a", finished_at: AT, rolled_back_at: null }],
    );
    expect(await readAppliedMigrations(prisma)).toEqual([done("a")]);
  });
});
