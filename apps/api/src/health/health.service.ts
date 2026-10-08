import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";

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

  /** Readiness : l'API ET ses dépendances (DB) sont prêtes. 503 sinon. */
  async ready() {
    const database = await this.pingDatabase();
    const body = { status: "ok" as const, database, timestamp: new Date().toISOString() };

    if (database !== "up") {
      throw new ServiceUnavailableException({ ...body, status: "degraded" });
    }
    return body;
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
