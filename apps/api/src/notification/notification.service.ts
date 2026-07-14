import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";

export type PlanPublishedEvent = {
  athleteId: string;
  planId: string;
  planTitle: string;
};

/**
 * Point d'émission des notifications métier (nouvelle planif, modif, message, facture — CDC §12).
 *
 * MOCKED — l'envoi push est différé à P4 (tâche p4-4) : il suppose l'enregistrement des tokens
 * device (expo-notifications + table PushToken) qui n'existe pas encore. En attendant, l'événement
 * est journalisé (Pino → Axiom) : le déclencheur métier est donc déjà en place et testé, seule la
 * livraison manque. Brancher `expo-server-sdk` ICI, sans toucher aux services appelants.
 */
@Injectable()
export class NotificationService {
  constructor(@InjectPinoLogger(NotificationService.name) private readonly logger: PinoLogger) {}

  async notifyPlanPublished(event: PlanPublishedEvent): Promise<void> {
    this.logger.info({ event: "plan.published", ...event }, "Planification diffusée à l'athlète");
    return Promise.resolve();
  }
}
