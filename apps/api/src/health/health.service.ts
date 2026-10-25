import { ABOUT_BLANK } from "@cmv/shared";
import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { ProblemException } from "../problem/problem.exception";

type DependencyState = "up" | "down";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness : le process répond. Ne touche aucune dépendance. */
  live() {
    return {
      status: "ok" as const,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness : l'API ET ses dépendances (DB) sont prêtes. 503 sinon, en problème (RFC 9457) dont
   * `detail` nomme la dépendance en panne — les sondes ne lisent que le statut.
   */
  async ready() {
    const database = await this.pingDatabase();
    if (database !== "up") {
      throw new ProblemException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ABOUT_BLANK,
        "Service Unavailable",
        "Base de données indisponible",
      );
    }
    return { status: "ok" as const, database, timestamp: new Date().toISOString() };
  }

  private async pingDatabase(): Promise<DependencyState> {
    try {
      // biome-ignore lint/plugin/noRawSql: sonde de disponibilité, SELECT 1 ne touche à aucune table
      await this.prisma.$queryRaw`SELECT 1`;
      return "up";
    } catch {
      return "down";
    }
  }
}
