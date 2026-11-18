import type { EnvSchema } from "@cmv/shared";
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { configReport } from "../config/config-report";

/**
 * Ce que l'API dit d'elle-même au démarrage (#212) : ce qui n'est pas configuré.
 *
 * Elle JOURNALISE, elle ne refuse jamais de démarrer : chaque groupe de configuration est
 * optionnel par contrat (`env.schema.ts` : « l'API démarre sans, tout le reste fonctionne ») ; ce
 * qu'un tier déployé exige vraiment, `envSchema` le refuse déjà (#357).
 *
 * Une ligne `warn` n'est pas une panne, c'est un constat — qui se lit au lancement, et pas au
 * premier envoi raté.
 */
@Injectable()
export class StartupReportService implements OnApplicationBootstrap {
  constructor(
    private readonly config: ConfigService<EnvSchema, true>,
    @InjectPinoLogger(StartupReportService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.reportConfiguration();
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
}
