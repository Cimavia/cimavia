import type { EnvSchema } from "@cmv/shared";
import { NotificationEntityType, NotificationType } from "@cmv/shared";
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

// Les trois ajustements d'un cycle diffusé (séance modifiée, ajoutée, retirée) portent la même
// charge : à qui, dans quel cycle, quelle séance. Seul le libellé change.
export type PlanSessionEvent = {
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

export type MessageReceivedEvent = {
  // Le DESTINATAIRE (l'autre partie du fil), résolu par l'appelant depuis une conversation DÉJÀ
  // scopée — jamais depuis le client (règle 1). L'expéditeur sert à afficher son nom.
  recipientId: string;
  senderId: string;
  conversationId: string;
};

export type InvoiceIssuedEvent = {
  // L'athlète destinataire, résolu par l'appelant depuis une entité DÉJÀ scopée (règle 1).
  athleteId: string;
  invoiceId: string;
};

/**
 * Ce que le client reçoit dans les données de la notification : de quoi router vers le bon écran à
 * l'ouverture. Le `type` est typé depuis `NotificationType` pour que le push et la ligne persistée
 * ne puissent pas diverger ; les CLÉS d'id, elles, restent telles quelles — une app déjà installée
 * lit `planId`/`scheduledSessionId`, les renommer casserait sa navigation.
 */
type PushPayload =
  | { type: typeof NotificationType.PLAN_PUBLISHED; planId: string }
  | { type: typeof NotificationType.PLAN_UPDATED; planId: string }
  | { type: typeof NotificationType.PLAN_SESSION_ADDED; planId: string }
  | { type: typeof NotificationType.PLAN_SESSION_REMOVED; planId: string }
  | { type: typeof NotificationType.FEEDBACK_RECEIVED; scheduledSessionId: string }
  | { type: typeof NotificationType.MESSAGE_RECEIVED; conversationId: string }
  | { type: typeof NotificationType.INVOICE_ISSUED; invoiceId: string };

type PushContent = { title: string; body: string; data: PushPayload };

/** Ce qu'on écrit en base : le libellé n'y est pas — seulement de quoi le rendre (cf. §3). */
type NotificationRecord = {
  recipientId: string;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  actorName: string | null;
  subjectLabel: string | null;
};

/**
 * Point d'émission des notifications métier (CDC §12) : nouvelle planif, ajustement de planif,
 * débrief reçu — puis message (P5) et facture (P6).
 *
 * Trois règles gouvernent ce service :
 *
 * 1. **Il écrit et lit pour le DESTINATAIRE, donc dans un autre tenant** (le coach notifie son
 *    athlète, et réciproquement). Le client tenant refuserait par construction — on passe donc par
 *    le PrismaService de base, comme UserDirectoryService. C'est sûr à une condition, respectée par
 *    tous les appelants : l'id du destinataire vient d'une requête DÉJÀ scopée, jamais du client.
 *
 * 2. **Aucun échec ne fait échouer l'action métier.** Diffuser un cycle réussit même si Expo est
 *    injoignable : l'erreur est journalisée (Pino → Axiom), pas propagée. Une notification est un
 *    effet de bord, pas une transaction — et les appelants notifient APRÈS avoir commité, donc une
 *    exception ici transformerait une action réussie en 500.
 *
 * 3. **Persistance et push dégradent SÉPARÉMENT** (#48). Chaque événement laisse une trace en base
 *    *en plus* du push, jamais à sa place : le push est éphémère (téléphone éteint, permission
 *    refusée, ou compte qui n'a jamais ouvert le mobile — le cas du coach sur web). Chacun a donc
 *    son garde-fou : un push injoignable n'empêche pas la trace, une écriture qui échoue
 *    n'empêche pas la livraison.
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
    await this.emit(
      {
        recipientId: event.athleteId,
        type: NotificationType.PLAN_PUBLISHED,
        entityType: NotificationEntityType.PLAN,
        entityId: event.planId,
        actorName: null,
        subjectLabel: event.planTitle,
      },
      {
        title: "Nouvelle planification",
        body: `Ton coach a diffusé « ${event.planTitle} ».`,
        data: { type: NotificationType.PLAN_PUBLISHED, planId: event.planId },
      },
    );
  }

  // Ajustement en cours de cycle (CDC §5.7) : sans notification, l'athlète s'entraînerait sur
  // une version périmée — qu'il a peut-être déjà en cache hors-ligne. Les trois formes
  // d'ajustement ci-dessous sont distinctes parce que l'athlète n'a pas le même geste à faire.
  async notifyPlanUpdated(event: PlanSessionEvent): Promise<void> {
    this.logger.info({ event: "plan.updated", ...event }, "Planification ajustée par le coach");
    await this.emit(
      {
        recipientId: event.athleteId,
        type: NotificationType.PLAN_UPDATED,
        entityType: NotificationEntityType.PLAN,
        entityId: event.planId,
        actorName: null,
        subjectLabel: event.sessionTitle,
      },
      {
        title: "Séance modifiée",
        body: `Ton coach a ajusté « ${event.sessionTitle} ».`,
        data: { type: NotificationType.PLAN_UPDATED, planId: event.planId },
      },
    );
  }

  async notifyPlanSessionAdded(event: PlanSessionEvent): Promise<void> {
    this.logger.info({ event: "plan.session.added", ...event }, "Séance ajoutée au cycle diffusé");
    await this.emit(
      {
        recipientId: event.athleteId,
        type: NotificationType.PLAN_SESSION_ADDED,
        entityType: NotificationEntityType.PLAN,
        entityId: event.planId,
        actorName: null,
        subjectLabel: event.sessionTitle,
      },
      {
        title: "Séance ajoutée",
        body: `Ton coach a ajouté « ${event.sessionTitle} » à ton cycle.`,
        data: { type: NotificationType.PLAN_SESSION_ADDED, planId: event.planId },
      },
    );
  }

  // Le titre de la séance retirée est la SEULE trace qu'il en restera : la ligne est supprimée en
  // base, et l'athlète doit pouvoir comprendre ce qui a disparu de son planning.
  async notifyPlanSessionRemoved(event: PlanSessionEvent): Promise<void> {
    this.logger.info(
      { event: "plan.session.removed", ...event },
      "Séance retirée du cycle diffusé",
    );
    await this.emit(
      {
        recipientId: event.athleteId,
        type: NotificationType.PLAN_SESSION_REMOVED,
        entityType: NotificationEntityType.PLAN,
        entityId: event.planId,
        actorName: null,
        subjectLabel: event.sessionTitle,
      },
      {
        title: "Séance retirée",
        body: `Ton coach a retiré « ${event.sessionTitle} » de ton cycle.`,
        data: { type: NotificationType.PLAN_SESSION_REMOVED, planId: event.planId },
      },
    );
  }

  async notifyFeedbackReceived(event: FeedbackReceivedEvent): Promise<void> {
    this.logger.info({ event: "feedback.received", ...event }, "Débrief reçu par le coach");
    // Résolu AVANT l'émission, et non plus à la demande : la trace persistée en a besoin même
    // quand le coach n'a aucun appareil enregistré — c'est justement le cas qu'elle rattrape.
    const athleteName = await this.userName(event.athleteId);
    await this.emit(
      {
        recipientId: event.coachId,
        type: NotificationType.FEEDBACK_RECEIVED,
        entityType: NotificationEntityType.SCHEDULED_SESSION,
        entityId: event.scheduledSessionId,
        actorName: athleteName,
        subjectLabel: event.sessionTitle,
      },
      {
        title: "Nouveau débrief",
        // Un coach suit N athlètes : sans le nom, la notification serait inexploitable.
        body: `${athleteName ?? "Un de tes athlètes"} a débriefé « ${event.sessionTitle} ».`,
        data: {
          type: NotificationType.FEEDBACK_RECEIVED,
          scheduledSessionId: event.scheduledSessionId,
        },
      },
    );
  }

  /**
   * Nouveau message reçu (CDC §5.8). Le déclencheur (éviter une rafale de notifications) est décidé
   * par l'appelant — comme « seule la création d'un débrief notifie » en P4 : le MessageService ne
   * notifie qu'au passage « tout lu » → « non lu » du fil. Ici on ne fait que livrer. Le centre de
   * notifications hérite donc du même throttle : une entrée par rafale, pas une par message.
   */
  async notifyMessageReceived(event: MessageReceivedEvent): Promise<void> {
    this.logger.info({ event: "message.received", ...event }, "Message reçu");
    const senderName = await this.userName(event.senderId);
    await this.emit(
      {
        recipientId: event.recipientId,
        type: NotificationType.MESSAGE_RECEIVED,
        entityType: NotificationEntityType.CONVERSATION,
        entityId: event.conversationId,
        actorName: senderName,
        subjectLabel: null,
      },
      {
        // Le nom de l'expéditeur en titre : un coach suit N athlètes, l'athlète a 1 coach — dans
        // les deux cas c'est l'info utile. Corps générique (le média n'a pas de texte à montrer).
        title: senderName ?? "Nouveau message",
        body: "Tu as reçu un nouveau message.",
        data: { type: NotificationType.MESSAGE_RECEIVED, conversationId: event.conversationId },
      },
    );
  }

  // Facture émise (CDC §5.10). L'athlète est notifié qu'une facture l'attend ; le montant n'est
  // pas mis dans le corps (une notification n'est pas un relevé — il ouvre l'écran Factures).
  async notifyInvoiceIssued(event: InvoiceIssuedEvent): Promise<void> {
    this.logger.info({ event: "invoice.issued", ...event }, "Facture émise par le coach");
    await this.emit(
      {
        recipientId: event.athleteId,
        type: NotificationType.INVOICE_ISSUED,
        entityType: NotificationEntityType.INVOICE,
        entityId: event.invoiceId,
        actorName: null,
        subjectLabel: null,
      },
      {
        title: "Nouvelle facture",
        body: "Ton coach t'a émis une facture.",
        data: { type: NotificationType.INVOICE_ISSUED, invoiceId: event.invoiceId },
      },
    );
  }

  /**
   * Les deux canaux d'un même événement. La persistance passe EN PREMIER, et surtout avant le
   * « aucun appareil → rien à faire » du push : c'est exactement le compte web-only qui, sans ça,
   * ne recevrait jamais rien.
   */
  private async emit(record: NotificationRecord, push: PushContent): Promise<void> {
    await this.persist(record);
    await this.push(record.recipientId, push);
  }

  private async persist(record: NotificationRecord): Promise<void> {
    try {
      await this.prisma.notification.create({ data: record });
    } catch (error) {
      // Règle 2 : l'action métier a déjà réussi et commité — on journalise, on rend la main.
      this.logger.error(
        { err: error, recipientId: record.recipientId, type: record.type },
        "Échec d'enregistrement de la notification",
      );
    }
  }

  /**
   * Nom d'un utilisateur, pour nommer l'acteur d'une notification. `null` si introuvable OU si la
   * lecture échoue : un nom manquant dégrade le libellé (le client rend une formule générique),
   * il ne doit pas empêcher la notification (règle 2).
   */
  private async userName(userId: string): Promise<string | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      return user?.name ?? null;
    } catch (error) {
      this.logger.error({ err: error, userId }, "Résolution du nom de l'acteur impossible");
      return null;
    }
  }

  /**
   * Envoie à tous les appareils du destinataire. Sans appareil enregistré (compte web-only,
   * permission refusée, e2e), il n'y a rien à livrer — l'événement reste journalisé, et depuis
   * #48 il reste surtout consultable dans le centre de notifications.
   */
  private async push(userId: string, content: PushContent): Promise<void> {
    try {
      const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
      // Un token stocké peut avoir été invalidé côté Expo depuis : on filtre avant l'envoi.
      const valid = tokens.filter((row) => Expo.isExpoPushToken(row.token));
      if (valid.length === 0) return;

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
      await this.handleTickets(userId, valid, tickets);
    } catch (error) {
      // Règle 2 : on journalise et on rend la main — l'action métier a déjà réussi.
      this.logger.error({ err: error, userId }, "Échec d'envoi de la notification push");
    }
  }

  /**
   * Dépouille les accusés d'Expo. **Tout ticket en erreur est journalisé**, pas seulement celui
   * qu'on sait traiter : un refus de livraison (credentials FCM absentes pour l'identifiant
   * d'application, message trop gros…) était jusqu'ici parfaitement silencieux — l'API croyait
   * avoir envoyé, le téléphone ne recevait rien, et aucun log ne le disait.
   *
   * On journalise l'**id** de la ligne, jamais le token : ce n'est pas un secret, mais qui le
   * connaît peut détourner les notifications de quelqu'un (dette P4-3).
   */
  private async handleTickets(
    userId: string,
    tokens: { id: string; token: string }[],
    tickets: ExpoPushTicket[],
  ): Promise<void> {
    const failures: { tokenId: string; error: string | null; message: string }[] = [];
    const unregisteredIds: string[] = [];

    for (const [index, token] of tokens.entries()) {
      const ticket = tickets[index];
      if (ticket?.status !== "error") continue;

      const error = ticket.details?.error ?? null;
      failures.push({ tokenId: token.id, error, message: ticket.message });
      // `DeviceNotRegistered` = l'app a été désinstallée, ou le token a tourné. Expo demande
      // explicitement de cesser d'y écrire : on supprime la ligne, sinon on conserverait des
      // adresses mortes qu'on réessaierait à chaque événement.
      if (error === "DeviceNotRegistered") unregisteredIds.push(token.id);
    }

    if (failures.length === 0) return;
    this.logger.error({ userId, failures }, "Notifications push refusées par Expo");

    if (unregisteredIds.length === 0) return;
    this.logger.info(
      { count: unregisteredIds.length },
      "Purge des tokens push d'appareils désinscrits",
    );
    await this.prisma.pushToken.deleteMany({ where: { id: { in: unregisteredIds } } });
  }
}
