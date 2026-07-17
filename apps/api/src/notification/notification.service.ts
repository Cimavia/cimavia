import type { EnvSchema } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../infra/prisma/prisma.service";

export type PlanPublishedEvent = {
  athleteId: string;
  planId: string;
  planTitle: string;
};

export type PlanUpdatedEvent = {
  athleteId: string;
  planId: string;
  sessionTitle: string;
};

export type FeedbackReceivedEvent = {
  coachId: string;
  // L'id, pas le nom : le résoudre ici garde la lecture de `User` (table hors scope tenant) et
  // le « un push ne casse jamais l'action métier » au même endroit — l'appelant ne fait rien.
  athleteId: string;
  scheduledSessionId: string;
  sessionTitle: string;
};

// Ce que le client reçoit dans les données de la notification : de quoi router vers le bon
// écran à l'ouverture. Typé ici pour que la navigation mobile n'ait pas à deviner.
type PushPayload =
  | { type: "PLAN_PUBLISHED"; planId: string }
  | { type: "PLAN_UPDATED"; planId: string }
  | { type: "FEEDBACK_RECEIVED"; scheduledSessionId: string };

type PushContent = { title: string; body: string; data: PushPayload };

/**
 * Point d'émission des notifications métier (CDC §12) : nouvelle planif, ajustement de planif,
 * débrief reçu — puis message (P5) et facture (P6).
 *
 * Deux règles gouvernent ce service :
 *
 * 1. **Il lit les tokens du DESTINATAIRE, donc d'un autre tenant** (le coach notifie son athlète,
 *    et réciproquement). Le client tenant refuserait par construction — on passe donc par le
 *    PrismaService de base, comme UserDirectoryService. C'est sûr à une condition, respectée par
 *    tous les appelants : l'id du destinataire vient d'une requête DÉJÀ scopée, jamais du client.
 *
 * 2. **Un échec de push ne fait jamais échouer l'action métier.** Diffuser un cycle réussit même
 *    si Expo est injoignable : l'erreur est journalisée (Pino → Axiom), pas propagée. Une
 *    notification est un effet de bord, pas une transaction.
 */
@Injectable()
export class NotificationService {
  private readonly expo: Expo;

  constructor(
    @InjectPinoLogger(NotificationService.name) private readonly logger: PinoLogger,
    // Client NON scopé : voir la règle 1 ci-dessus.
    private readonly prisma: PrismaService,
    config: ConfigService<EnvSchema, true>,
  ) {
    // Aucun secret requis pour envoyer : le token n'est utile qu'avec « Enhanced Security »
    // activé côté Expo. Absent → les push partent quand même.
    this.expo = new Expo({ accessToken: config.get("EXPO_ACCESS_TOKEN", { infer: true }) });
  }

  async notifyPlanPublished(event: PlanPublishedEvent): Promise<void> {
    this.logger.info({ event: "plan.published", ...event }, "Planification diffusée à l'athlète");
    await this.send(event.athleteId, () => ({
      title: "Nouvelle planification",
      body: `Ton coach a diffusé « ${event.planTitle} ».`,
      data: { type: "PLAN_PUBLISHED", planId: event.planId },
    }));
  }

  // Ajustement en cours de cycle (CDC §5.7) : sans notification, l'athlète s'entraînerait sur
  // une version périmée — qu'il a peut-être déjà en cache hors-ligne.
  async notifyPlanUpdated(event: PlanUpdatedEvent): Promise<void> {
    this.logger.info({ event: "plan.updated", ...event }, "Planification ajustée par le coach");
    await this.send(event.athleteId, () => ({
      title: "Séance modifiée",
      body: `Ton coach a ajusté « ${event.sessionTitle} ».`,
      data: { type: "PLAN_UPDATED", planId: event.planId },
    }));
  }

  async notifyFeedbackReceived(event: FeedbackReceivedEvent): Promise<void> {
    this.logger.info({ event: "feedback.received", ...event }, "Débrief reçu par le coach");
    await this.send(event.coachId, async () => {
      const athlete = await this.prisma.user.findUnique({
        where: { id: event.athleteId },
        select: { name: true },
      });
      return {
        title: "Nouveau débrief",
        // Un coach suit N athlètes : sans le nom, la notification serait inexploitable.
        body: `${athlete?.name ?? "Un de tes athlètes"} a débriefé « ${event.sessionTitle} ».`,
        data: { type: "FEEDBACK_RECEIVED", scheduledSessionId: event.scheduledSessionId },
      };
    });
  }

  /**
   * Envoie à tous les appareils du destinataire. Sans appareil enregistré (compte web-only,
   * permission refusée, e2e), il n'y a rien à livrer — l'événement reste journalisé.
   *
   * Le contenu est construit par une fonction, pas passé tout fait : il peut demander une
   * requête (résoudre un nom), qui n'a pas lieu d'être si personne n'a d'appareil — et qui
   * profite ainsi du filet de la règle 2.
   */
  private async send(userId: string, build: () => PushContent | Promise<PushContent>) {
    try {
      const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
      // Un token stocké peut avoir été invalidé côté Expo depuis : on filtre avant l'envoi.
      const valid = tokens.filter((row) => Expo.isExpoPushToken(row.token));
      if (valid.length === 0) return;

      const content = await build();
      const messages: ExpoPushMessage[] = valid.map((row) => ({
        to: row.token,
        sound: "default",
        title: content.title,
        body: content.body,
        data: content.data,
      }));

      // Expo impose de découper les envois en lots ; le SDK s'en charge.
      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets: ExpoPushTicket[] = [];
      for (const chunk of chunks) {
        tickets.push(...(await this.expo.sendPushNotificationsAsync(chunk)));
      }
      await this.purgeUnregistered(valid, tickets);
    } catch (error) {
      // Règle 2 : on journalise et on rend la main — l'action métier a déjà réussi.
      this.logger.error({ err: error, userId }, "Échec d'envoi de la notification push");
    }
  }

  /**
   * `DeviceNotRegistered` = l'app a été désinstallée, ou le token a tourné. Expo demande
   * explicitement de cesser d'y écrire : on supprime la ligne, sinon on conserverait des
   * adresses mortes qu'on réessaierait à chaque événement.
   */
  private async purgeUnregistered(
    tokens: { id: string; token: string }[],
    tickets: ExpoPushTicket[],
  ): Promise<void> {
    const dead = tokens.filter((_, index) => {
      const ticket = tickets[index];
      return ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered";
    });
    if (dead.length === 0) return;

    this.logger.info({ count: dead.length }, "Purge des tokens push d'appareils désinscrits");
    await this.prisma.pushToken.deleteMany({ where: { id: { in: dead.map((t) => t.id) } } });
  }
}
