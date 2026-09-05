import type { EmailableNotificationType, EnvSchema, PersistedNotificationType } from "@cmv/shared";
import {
  EMAILABLE_NOTIFICATION_TYPES,
  NotificationEntityType,
  NotificationType,
} from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { ClsService } from "nestjs-cls";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { NotificationMailer } from "../infra/mail/notification.mailer";
import { PrismaService } from "../infra/prisma/prisma.service";
import { TENANT_CLS_KEY, type TenantContext } from "../tenancy/tenant-context.type";

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
 * Une invitation nominative vient d'être émise (#146), et l'adresse visée a un compte athlète.
 *
 * Le coach est passé par son ID et non par son nom : le résoudre ici garde au même endroit la
 * lecture de `User` (table hors scope tenant) et le « une notification ne casse jamais l'action
 * métier » — l'appelant n'a rien à faire de plus qu'émettre.
 */
export type InvitationReceivedEvent = {
  athleteId: string;
  coachId: string;
  invitationId: string;
};

/**
 * L'athlète a répondu — rejoint ou refusé. Une seule charge pour les deux, comme les trois
 * ajustements de cycle : mêmes parties, même entité, seul le sens de la réponse change.
 */
export type InvitationAnsweredEvent = {
  coachId: string;
  athleteId: string;
  invitationId: string;
};

export type ReminderDueEvent = {
  // Le coach qui s'est écrit ce rappel — un rappel n'a pas d'autre destinataire.
  coachId: string;
  reminderId: string;
  /**
   * Le texte du push, DÉJÀ composé par l'appelant : sa note, ou le libellé français de son motif.
   * Rendu côté serveur, contrairement à tout le reste du centre — c'est l'exception assumée du
   * push, qui n'a pas de client pour traduire au moment de la livraison (cf. #63).
   */
  label: string;
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
  | { type: typeof NotificationType.INVOICE_ISSUED; invoiceId: string }
  | { type: typeof NotificationType.INVITATION_RECEIVED; invitationId: string }
  | { type: typeof NotificationType.INVITATION_ACCEPTED; invitationId: string }
  | { type: typeof NotificationType.INVITATION_DECLINED; invitationId: string }
  // Le seul type poussé SANS ligne en base (#47) : l'entrée du centre reste calculée à la lecture.
  // Sa clé d'id est `reminderId`, comme les autres sont `planId` ou `invoiceId`.
  | { type: typeof NotificationType.REMINDER_DUE; reminderId: string };

type PushContent = { title: string; body: string; data: PushPayload };

/**
 * Ce qu'on écrit en base : le libellé n'y est pas — seulement de quoi le rendre (cf. §3).
 *
 * `PersistedNotificationType` et non `NotificationType` : `REMINDER_DUE` (#51) est calculé à la
 * lecture depuis la table `reminder` et n'existe pas dans l'enum Prisma. L'exclusion est portée par
 * le type plutôt que par une garde, pour que la faute se voie à la compilation.
 */
type NotificationRecord = {
  recipientId: string;
  type: PersistedNotificationType;
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
    private readonly cls: ClsService,
    private readonly mailer: NotificationMailer,
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
   * Une invitation nominative attend son destinataire (#146). Le seul des trois où l'athlète est
   * prévenu ; les deux suivants remontent sa réponse au coach.
   *
   * Émis UNIQUEMENT quand l'adresse visée a un compte athlète — l'appelant l'a résolu avant
   * d'appeler. Une adresse inconnue n'est pas un échec : c'est le cas courant de l'invitation d'un
   * nouvel athlète, et son canal est l'e-mail.
   */
  async notifyInvitationReceived(event: InvitationReceivedEvent): Promise<void> {
    this.logger.info({ event: "invitation.received", ...event }, "Invitation adressée à un compte");
    const coachName = await this.userName(event.coachId);
    await this.emit(
      {
        recipientId: event.athleteId,
        type: NotificationType.INVITATION_RECEIVED,
        entityType: NotificationEntityType.INVITATION,
        entityId: event.invitationId,
        actorName: coachName,
        subjectLabel: null,
      },
      {
        title: "Invitation",
        // Le nom EST l'information : un athlète non lié n'a aucun contexte qui dise de qui vient
        // cette invitation, contrairement à un cycle diffusé par le coach qu'il a déjà.
        body: `${coachName ?? "Un coach"} t'invite à rejoindre son espace.`,
        data: {
          type: NotificationType.INVITATION_RECEIVED,
          invitationId: event.invitationId,
        },
      },
    );
  }

  // L'athlète a rejoint : le coach le verra apparaître dans son tableau de suivi.
  async notifyInvitationAccepted(event: InvitationAnsweredEvent): Promise<void> {
    this.logger.info({ event: "invitation.accepted", ...event }, "Invitation acceptée");
    const athleteName = await this.userName(event.athleteId);
    await this.emit(
      {
        recipientId: event.coachId,
        type: NotificationType.INVITATION_ACCEPTED,
        entityType: NotificationEntityType.INVITATION,
        entityId: event.invitationId,
        actorName: athleteName,
        subjectLabel: null,
      },
      {
        title: "Invitation acceptée",
        body: `${athleteName ?? "Un athlète"} a rejoint ton espace.`,
        data: {
          type: NotificationType.INVITATION_ACCEPTED,
          invitationId: event.invitationId,
        },
      },
    );
  }

  /**
   * L'athlète a refusé. C'est la SEULE trace qu'il en restera pour le coach au moment où ça se
   * produit : l'invitation quitte `PENDING` et disparaît de son panneau d'invitations en attente.
   * Sans cette notification, un refus serait indiscernable d'une invitation qu'on ignore.
   */
  async notifyInvitationDeclined(event: InvitationAnsweredEvent): Promise<void> {
    this.logger.info({ event: "invitation.declined", ...event }, "Invitation refusée");
    const athleteName = await this.userName(event.athleteId);
    await this.emit(
      {
        recipientId: event.coachId,
        type: NotificationType.INVITATION_DECLINED,
        entityType: NotificationEntityType.INVITATION,
        entityId: event.invitationId,
        actorName: athleteName,
        subjectLabel: null,
      },
      {
        title: "Invitation refusée",
        body: `${athleteName ?? "Un athlète"} a refusé ton invitation.`,
        data: {
          type: NotificationType.INVITATION_DECLINED,
          invitationId: event.invitationId,
        },
      },
    );
  }

  /**
   * Rappel arrivé à échéance (#47) — la dette **R-1**. Sans lui, un rappel qui devient dû n'émettait
   * aucun signal : il n'apparaissait qu'au prochain chargement du centre.
   *
   * **La seule émission qui ne passe PAS par `emit`, et c'est le cœur de la décision.** Écrire une
   * ligne `notification` ici ferait apparaître le rappel DEUX FOIS dans le centre — une fois
   * persistée, une fois calculée depuis la table `reminder` (#51). Le choix « calculer plutôt que
   * persister » reste donc entier ; ce push n'en est qu'un canal de plus, et le typecheck
   * l'interdirait de toute façon (`REMINDER_DUE` est exclu de `PersistedNotificationType`).
   *
   * Conséquence assumée : un rappel dû n'a pas de trace « livrée » côté notifications, seulement le
   * `pushedAt` du rappel lui-même. C'est suffisant — l'entrée du centre, elle, ne dépend d'aucun
   * envoi.
   */
  async notifyReminderDue(event: ReminderDueEvent): Promise<void> {
    this.logger.info(
      { event: "reminder.due", coachId: event.coachId, reminderId: event.reminderId },
      "Rappel arrivé à échéance",
    );
    await this.push(event.coachId, {
      // Titre générique, contenu dans le corps : la note du coach EST le rappel, la mettre en titre
      // la tronquerait sur la plupart des appareils.
      title: "Rappel",
      body: event.label,
      data: { type: NotificationType.REMINDER_DUE, reminderId: event.reminderId },
    });
  }

  /**
   * Les deux canaux d'un même événement. La persistance passe EN PREMIER, et surtout avant le
   * « aucun appareil → rien à faire » du push : c'est exactement le compte web-only qui, sans ça,
   * ne recevrait jamais rien.
   */
  private async emit(record: NotificationRecord, push: PushContent): Promise<void> {
    // On ne s'annonce pas à soi-même ce qu'on vient de faire (#14). En auto-coaching, l'émetteur
    // et le destinataire sont le même compte : diffuser son propre cycle ou écrire son propre
    // débrief déclencherait une notification pour une action qu'on vient de mener.
    //
    // La garde vit ICI plutôt que chez les cinq appelants : elle vaut pour tout émetteur, y
    // compris ceux qui n'existent pas encore. Elle ne touche PAS `notifyReminderDue`, qui pousse
    // sans passer par `emit` — un rappel se destine légitimement à celui qui l'a posé, ce n'est
    // pas l'annonce d'une action mais l'arrivée d'une échéance.
    //
    // Hors contexte tenant (aucun acteur), on émet : c'est le cas d'un déclencheur système, où
    // personne n'a « fait » l'action.
    const actor = this.cls.get<TenantContext | undefined>(TENANT_CLS_KEY);
    if (actor?.userId === record.recipientId) {
      this.logger.debug(
        { recipientId: record.recipientId, type: record.type },
        "Notification vers soi-même ignorée (auto-coaching)",
      );
      return;
    }

    await this.persist(record);
    await this.push(record.recipientId, push);
    await this.email(record);
  }

  /**
   * Troisième canal (#65) : l'e-mail, si le destinataire l'a demandé pour ce type.
   *
   * **Opt-in** — aucune ligne de préférence, aucun envoi. C'est aussi ce qui rend ce canal
   * silencieux pour tout le parc existant, sans migration de données.
   *
   * **Indépendant du push** : il part que le push soit arrivé ou non. Le conditionner à l'absence
   * d'appareil ferait un comportement qui change tout seul le jour où l'utilisateur installe
   * l'app — et Expo ne confirme de toute façon la livraison qu'en différé (dette N-7).
   *
   * **Placé après la persistance et le push, et il dégrade seul** : un envoi impossible ne doit ni
   * empêcher la trace, ni la livraison, ni l'action métier (règles 2 et 3). Il hérite en outre de
   * la garde anti-auto-notification, qui vit dans `emit` au-dessus.
   */
  private async email(record: NotificationRecord): Promise<void> {
    try {
      const type = emailableType(record.type);
      if (type == null) return;

      // La PRÉFÉRENCE d'abord, l'utilisateur ensuite : l'opt-in fait que le cas courant est
      // « personne n'a rien activé », et il ne doit coûter qu'une seule requête. Lire l'adresse
      // avant de savoir si on s'en sert en coûterait deux à chaque notification du parc.
      //
      // Sur le client NON scopé, comme tout ce que fait ce service : le destinataire n'est pas
      // l'acteur courant (règle 1), et le client tenant refuserait.
      const wanted = await this.prisma.notificationEmailPreference.findFirst({
        where: { userId: record.recipientId, type: record.type },
        select: { id: true },
      });
      if (wanted == null) return;

      const recipient = await this.prisma.user.findUnique({
        where: { id: record.recipientId },
        select: { email: true, locale: true },
      });
      if (recipient == null) return;

      await this.mailer.send(type, recipient, {
        actorName: record.actorName,
        subjectLabel: record.subjectLabel,
      });
    } catch (error) {
      this.logger.error(
        { err: error, recipientId: record.recipientId, type: record.type },
        "Échec de l'envoi de la notification par e-mail",
      );
    }
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

/**
 * Le type, s'il fait partie de ceux qu'on envoie par e-mail — `null` sinon.
 *
 * Les trois ajustements de cycle n'y sont pas : ils arrivent par rafales et rien ne les groupe
 * (dette N-6). La liste vit dans `@cmv/shared` parce que l'écran de réglages la rend aussi.
 */
function emailableType(type: PersistedNotificationType): EmailableNotificationType | null {
  return EMAILABLE_NOTIFICATION_TYPES.find((emailable) => emailable === type) ?? null;
}
