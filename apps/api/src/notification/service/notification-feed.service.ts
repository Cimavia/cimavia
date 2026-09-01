import type { NotificationDto, UnreadCountDto } from "@cmv/shared";
import {
  capabilityOfNotification,
  NOTIFICATION_PAGE_SIZE,
  NotificationType,
  parseReminderFeedId,
} from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { toReminderFeedEntry } from "../../reminder/reminder.mapper";
import { ReminderService } from "../../reminder/service/reminder.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor, runAsCapability } from "../../tenancy/tenant-context.type";
import { toNotificationDto } from "../notification.mapper";

/**
 * Lecture du centre de notifications (#48) — la face « consultation » de ce que
 * `NotificationService` écrit à l'émission.
 *
 * Client TENANT ici, contrairement au service d'émission : on ne lit que ce qu'on a REÇU, et le
 * scope `recipientId` s'en porte garant pour les deux rôles. L'écriture, elle, vise le destinataire
 * — donc un autre tenant — et reste hors de ce client.
 *
 * Depuis #51, le centre a DEUX sources : les lignes `notification`, et les **rappels dus** du coach,
 * calculés à la lecture (il n'y a pas de scheduler pour les persister au bon moment). Trois
 * conséquences, qui expliquent la forme de ce service :
 *
 * 1. **Tout est branché sur la capacité coach.** `Reminder` n'a pas de scope athlète : lire la
 *    table pour un athlète ne renverrait pas une liste vide, ça LÈVERAIT (fail closed) — et
 *    `GET /me/notifications` partirait en 500 pour tout athlète, sur un écran qui ne parle même pas
 *    de rappels. D'où `isCoach()` avant chaque accès, et `asCoach()` autour de chacun.
 * 2. **Les entrées de rappel ont un id préfixé** (`reminder:…`), ce qui garde une seule route de
 *    marquage et laisse les deux UI ignorer qu'il y a deux sources.
 * 3. **La borne s'applique APRÈS la fusion.** Chaque source est bornée, puis le mélange est retrié et
 *    retronqué : sinon un rappel dû de l'an dernier prendrait la place d'une notification du jour.
 */
@Injectable()
export class NotificationFeedService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly cls: ClsService,
    private readonly reminders: ReminderService,
  ) {}

  /**
   * Les plus récentes d'abord, bornées à `NOTIFICATION_PAGE_SIZE`. Un centre de notifications
   * montre ce qui vient d'arriver, pas un historique complet — d'où la borne plutôt qu'une
   * pagination (dette assumée, même famille que P2-2 / P5-1).
   *
   * Un rappel dû est daté de son ÉCHÉANCE (`createdAt` = `dueAt`, cf. `reminderToNotificationDto`) :
   * il se range donc au moment où il commence à compter, pas à celui où le coach l'a saisi.
   */
  async list(): Promise<NotificationDto[]> {
    const now = new Date();
    const [rows, dueReminders] = await Promise.all([
      this.db.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: NOTIFICATION_PAGE_SIZE,
      }),
      this.isCoach() ? this.asCoach(() => this.reminders.listDue(now, NOTIFICATION_PAGE_SIZE)) : [],
    ]);

    const entries = [...rows.map(toNotificationDto), ...dueReminders.map(toReminderFeedEntry)];
    // Comparaison sur l'instant parsé, pas sur la chaîne : les deux sources sont bien en UTC
    // aujourd'hui, mais un tri lexicographique reposerait sur ce format sans le dire.
    entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return entries.slice(0, NOTIFICATION_PAGE_SIZE);
  }

  /**
   * Servi à part de la liste : le badge se rafraîchit en continu (polling), la liste seulement
   * quand le panneau est ouvert. Compter, c'est un index ; lister, c'est des lignes.
   */
  async unreadCount(): Promise<UnreadCountDto> {
    const now = new Date();
    const [unread, dueReminders] = await Promise.all([
      // Les TYPES et non un simple `count` : la ventilation par espace (#176) s'en déduit, et
      // `groupBy` évite de ramener les lignes pour les compter.
      this.db.notification.groupBy({
        by: ["type"],
        where: { readAt: null },
        _count: { _all: true },
      }),
      this.isCoach() ? this.asCoach(() => this.reminders.countDueUnread(now)) : 0,
    ]);

    const byCapability = { coach: 0, athlete: 0 };
    let ambiguous = 0;
    for (const row of unread) {
      const capability = capabilityOfNotification(row.type);
      if (capability == null) {
        // Tout type dont le titre est indécidable : `MESSAGE_RECEIVED` (traité juste après) et
        // tout type inconnu d'une API plus récente. Compté dans le total, rangé nulle part.
        ambiguous += row._count._all;
      } else {
        byCapability[capability] += row._count._all;
      }
    }

    const messages = await this.unreadMessagesByCapability();
    byCapability.coach += messages.coach;
    byCapability.athlete += messages.athlete;
    ambiguous -= messages.coach + messages.athlete;

    // Les rappels dus ne sont pas persistés (#51) : ils s'ajoutent après coup, côté coach.
    byCapability.coach += dueReminders;

    return {
      count: byCapability.coach + byCapability.athlete + ambiguous,
      ...byCapability,
    };
  }

  /**
   * Les messages non lus, rangés par titre. Seul type dont la capacité ne se déduit PAS du type :
   * les deux côtés d'un fil en reçoivent, et seule la conversation dit lequel.
   *
   * On ne la devine pas — on laisse le **scope tenant** répondre. Lire les fils cités « en tant que
   * coach » ne rend que ceux où l'on est le coach ; le reste est de l'athlète. C'est la même
   * frontière que partout ailleurs, donc elle ne peut pas diverger d'une logique parallèle.
   *
   * Court-circuité pour un compte mono-capacité : tout tombe de son seul côté, deux requêtes
   * seraient du travail pour une réponse connue d'avance.
   */
  private async unreadMessagesByCapability(): Promise<{ coach: number; athlete: number }> {
    const { capabilities } = currentActor(this.cls);
    const rows = await this.db.notification.findMany({
      where: { readAt: null, type: NotificationType.MESSAGE_RECEIVED },
      select: { entityId: true },
    });
    if (rows.length === 0) return { coach: 0, athlete: 0 };
    if (!capabilities.isCoach) return { coach: 0, athlete: rows.length };
    if (!capabilities.isAthlete) return { coach: rows.length, athlete: 0 };

    const ids = rows.map((row) => row.entityId);
    const asCoach = await this.asCoach(() =>
      this.db.conversation.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    const coachThreads = new Set(asCoach.map((conversation) => conversation.id));
    const coach = rows.filter((row) => coachThreads.has(row.entityId)).length;
    return { coach, athlete: rows.length - coach };
  }

  /**
   * Marque une entrée du centre comme lue. Idempotent, et surtout NON redaté : rouvrir une entrée
   * déjà lue ne doit pas la faire remonter comme fraîche (même règle que le marquage des débriefs).
   *
   * L'id décide de la table visée : préfixé, c'est un rappel dû ; sinon, une notification persistée.
   * C'est ce qui permet à `PATCH /me/notifications/:id/read` de rester une seule route.
   */
  async markRead(id: string): Promise<NotificationDto> {
    const reminderId = parseReminderFeedId(id);
    if (reminderId != null) return this.markReminderRead(reminderId);

    const notification = await this.db.notification.findFirst({ where: { id } });
    if (notification == null) {
      throw new NotFoundException("Notification introuvable");
    }
    if (notification.readAt != null) return toNotificationDto(notification);

    const updated = await this.db.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return toNotificationDto(updated);
  }

  // « Tout marquer comme lu » : vide le badge sans ouvrir chaque entrée. Ne touche que les non
  // lues, pour ne pas redater celles qui l'étaient déjà.
  async markAllRead(): Promise<void> {
    const now = new Date();
    await this.db.notification.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
    // Seuls les rappels DUS : marquer un rappel encore à venir éteindrait son badge par avance.
    if (this.isCoach()) {
      await this.asCoach(() => this.reminders.markAllDueRead(now));
    }
  }

  /**
   * Un athlète n'a aucun rappel — pas « zéro rappel », mais aucun accès au modèle. Un id préfixé
   * venant d'un athlète est donc une entrée qui n'existe pas pour lui : 404, et surtout PAS le 500
   * que produirait la lecture de la table hors scope.
   */
  private async markReminderRead(reminderId: string): Promise<NotificationDto> {
    if (!this.isCoach()) {
      throw new NotFoundException("Notification introuvable");
    }
    const reminder = await this.asCoach(() => this.reminders.markDueRead(reminderId));
    if (reminder == null) {
      throw new NotFoundException("Notification introuvable");
    }
    return toReminderFeedEntry(reminder);
  }

  /**
   * La capacité POSSÉDÉE, pas celle exercée : cette route n'a pas de titre (voir le contrôleur).
   * Un compte à double capacité voit donc l'intégralité de son centre — ses rappels de coach ET
   * ce qu'il reçoit comme athlète — ce qui est le sens même d'un centre de notifications.
   */
  private isCoach(): boolean {
    return currentActor(this.cls).capabilities.isCoach;
  }

  /**
   * Toute lecture de `Reminder` passe par ici. La route ne déclarant aucune capacité, le scope
   * tenant refuserait la table : on précise le titre au plus près de la lecture, sans en donner un
   * à la route entière.
   */
  private asCoach<T>(fn: () => Promise<T>): Promise<T> {
    return runAsCapability(this.cls, "coach", fn);
  }
}
