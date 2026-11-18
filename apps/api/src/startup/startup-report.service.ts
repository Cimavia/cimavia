import type { EnvSchema } from "@cmv/shared";
import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { configReport } from "../config/config-report";
import {
  MIGRATIONS_DIR,
  migrationDrift,
  readAppliedMigrations,
  readMigrationsOnDisk,
} from "../infra/prisma/migration-check";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Ce que l'API dit d'elle-même au démarrage (#212) : ce qui n'est pas configuré, ce qui n'est pas
 * migré.
 *
 * Elle JOURNALISE, elle ne refuse jamais de démarrer :
 * - chaque groupe de configuration est optionnel par contrat (`env.schema.ts` : « l'API démarre
 *   sans, tout le reste fonctionne ») ; ce qu'un tier déployé exige vraiment, `envSchema` le
 *   refuse déjà (#357) ;
 * - une migration en attente ne bloque pas non plus : quand les migrations sortiront de
 *   l'entrypoint (#84), l'API pourra démarrer AVANT elles, par construction.
 *
 * Une ligne `warn` n'est pas une panne, c'est un constat — qui se lit au lancement, et pas au
 * premier envoi raté.
 */
@Injectable()
export class StartupReportService implements OnApplicationBootstrap, OnModuleDestroy {
  /**
   * Le contrôle des migrations lancé au démarrage, qui se résout quand il a journalisé. `listen`
   * ne l'attend pas ; l'arrêt et le harnais e2e, si — les deux requêtes tomberaient sinon dans le
   * budget du premier appel mesuré (#629).
   */
  migrationCheck: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConfigService<EnvSchema, true>,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(StartupReportService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Un arrêt juste après le démarrage attend la fin du contrôle : sans quoi Prisma se déconnecterait
   * sous sa requête, et l'API journaliserait « contrôle impossible » à tort. `PrismaModule` est
   * global, Nest le détruit APRÈS ce module.
   */
  onModuleDestroy(): Promise<void> {
    return this.migrationCheck;
  }

  onApplicationBootstrap(): void {
    this.reportConfiguration();
    // Pas attendu : une base lente ou injoignable ne retarde pas `listen`.
    this.migrationCheck = this.reportMigrations();
  }

  reportConfiguration(): void {
    for (const line of configReport((variable) => this.config.get(variable, { infer: true }))) {
      const fields = { group: line.group, state: line.state, missing: line.missing };
      if (line.state === "complete") {
        this.logger.info(fields, line.message);
      } else {
        this.logger.warn(fields, line.message);
      }
    }
  }

  /**
   * Ne lève jamais. Un contrôle qui n'a pas pu se faire le DIT : il ne conclut pas « à jour »
   * (règle dure n°5), une base injoignable n'est pas une base migrée.
   */
  async reportMigrations(): Promise<void> {
    let drift: ReturnType<typeof migrationDrift>;
    let onDisk: string[];
    try {
      onDisk = await readMigrationsOnDisk(MIGRATIONS_DIR);
      drift = migrationDrift(onDisk, await readAppliedMigrations(this.prisma));
    } catch (error) {
      this.logger.warn(
        { err: error, dir: MIGRATIONS_DIR },
        "Contrôle des migrations impossible : leur état est inconnu",
      );
      return;
    }

    const { pending, failed, unknown } = drift;
    if (pending.length > 0) {
      this.logger.error(
        { pending },
        `${pending.length} migration(s) en attente : la base est en retard sur le code (prisma migrate deploy)`,
      );
    }
    if (failed.length > 0) {
      this.logger.error(
        { failed },
        `${failed.length} migration(s) en échec : à résoudre avant toute autre (prisma migrate resolve)`,
      );
    }
    if (unknown.length > 0) {
      this.logger.warn(
        { unknown },
        `${unknown.length} migration(s) appliquée(s) inconnue(s) du code : la base est en avance sur cette version`,
      );
    }
    if (pending.length + failed.length + unknown.length === 0) {
      this.logger.info({ count: onDisk.length }, "Migrations à jour");
    }
  }
}
