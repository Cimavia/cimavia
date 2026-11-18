import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import { MIGRATIONS_DIR, readMigrationsOnDisk } from "../infra/prisma/migration-check";
import type { PrismaService } from "../infra/prisma/prisma.service";
import { StartupReportService } from "./startup-report.service";

const AT = new Date("2026-11-18T10:00:00Z");

type Row = { migration_name: string; finished_at: Date | null; rolled_back_at: null };
const appliedRows = (names: string[]): Row[] =>
  names.map((name) => ({ migration_name: name, finished_at: AT, rolled_back_at: null }));

/** `rows` : ce que la table `_prisma_migrations` contient ; `Error` : la base ne répond pas. */
function serviceWith(env: Record<string, unknown>, rows: Row[] | Error = []) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService<EnvSchema, true>;
  const queryRaw = vi.fn();
  if (rows instanceof Error) {
    queryRaw.mockRejectedValue(rows);
  } else {
    queryRaw.mockResolvedValueOnce([{ present: true }]).mockResolvedValueOnce(rows);
  }
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const service = new StartupReportService(config, prisma, logger as unknown as PinoLogger);
  return { service, logger };
}

describe("StartupReportService — configuration", () => {
  it("journalise en warn un groupe absent, avec ce qui manque", () => {
    const { service, logger } = serviceWith({});
    service.reportConfiguration();
    expect(logger.warn).toHaveBeenCalledWith(
      { group: "tick", state: "off", missing: ["REMINDER_TICK_SECRET"] },
      "Configuration tick absente : le déclencheur de rappels répondra 503",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("journalise en info un groupe complet", () => {
    const { service, logger } = serviceWith({ EXPO_ACCESS_TOKEN: "expo" });
    service.reportConfiguration();
    expect(logger.info).toHaveBeenCalledWith(
      { group: "push", state: "complete", missing: [] },
      "Configuration push complète",
    );
  });

  it("écrit une ligne par groupe, jamais une erreur", () => {
    const { service, logger } = serviceWith({});
    service.reportConfiguration();
    expect(logger.warn).toHaveBeenCalledTimes(6);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

// Le vrai dossier `prisma/migrations` : vitest tourne depuis `apps/api`, comme l'API.
describe("StartupReportService — migrations", async () => {
  const onDisk = await readMigrationsOnDisk(MIGRATIONS_DIR);
  const latest = onDisk.at(-1) ?? "";

  it("dit les migrations à jour quand la base a tout appliqué", async () => {
    const { service, logger } = serviceWith({}, appliedRows(onDisk));
    await service.reportMigrations();
    expect(logger.info).toHaveBeenCalledWith({ count: onDisk.length }, "Migrations à jour");
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("journalise en error la migration en attente, par son nom", async () => {
    const { service, logger } = serviceWith({}, appliedRows(onDisk.slice(0, -1)));
    await service.reportMigrations();
    expect(logger.error).toHaveBeenCalledWith(
      { pending: [latest] },
      "1 migration(s) en attente : la base est en retard sur le code (prisma migrate deploy)",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("journalise en error une migration en échec", async () => {
    const rows = appliedRows(onDisk).map((row) =>
      row.migration_name === latest ? { ...row, finished_at: null } : row,
    );
    const { service, logger } = serviceWith({}, rows);
    await service.reportMigrations();
    expect(logger.error).toHaveBeenCalledWith(
      { failed: [latest] },
      "1 migration(s) en échec : à résoudre avant toute autre (prisma migrate resolve)",
    );
  });

  it("journalise en warn une base en avance sur le code", async () => {
    const { service, logger } = serviceWith({}, appliedRows([...onDisk, "29991231000000_future"]));
    await service.reportMigrations();
    expect(logger.warn).toHaveBeenCalledWith(
      { unknown: ["29991231000000_future"] },
      "1 migration(s) appliquée(s) inconnue(s) du code : la base est en avance sur cette version",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  // Règle dure n°5 : une base injoignable n'est pas une base à jour.
  it("dit le contrôle impossible sans lever quand la base ne répond pas", async () => {
    const down = new Error("connect ECONNREFUSED");
    const { service, logger } = serviceWith({}, down);
    await expect(service.reportMigrations()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      { err: down, dir: MIGRATIONS_DIR },
      "Contrôle des migrations impossible : leur état est inconnu",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe("StartupReportService — démarrage et arrêt", () => {
  /** Une base qui ne répond jamais, et de quoi la faire répondre. */
  function serviceWithHangingDatabase() {
    let answer: (rows: unknown) => void = () => {};
    const queryRaw = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const service = new StartupReportService(
      { get: () => undefined } as unknown as ConfigService<EnvSchema, true>,
      { $queryRaw: queryRaw } as unknown as PrismaService,
      logger as unknown as PinoLogger,
    );
    return { service, logger, queryRaw, answer: (rows: unknown) => answer(rows) };
  }

  const settled = async (promise: Promise<void>) => {
    let done = false;
    void promise.then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return done;
  };

  it("rend la main sans attendre une base qui ne répond pas", async () => {
    const { service, logger, queryRaw } = serviceWithHangingDatabase();
    expect(service.onApplicationBootstrap()).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(6);
    await vi.waitFor(() => expect(queryRaw).toHaveBeenCalled());
    expect(await settled(service.migrationCheck)).toBe(false);
  });

  it("attend la fin du contrôle avant de laisser Prisma se déconnecter", async () => {
    const { service, logger, queryRaw, answer } = serviceWithHangingDatabase();
    service.onApplicationBootstrap();
    await vi.waitFor(() => expect(queryRaw).toHaveBeenCalled());
    const destroyed = service.onModuleDestroy();
    expect(await settled(destroyed)).toBe(false);

    answer([{ present: false }]);
    await destroyed;
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("en attente"),
    );
  });
});
