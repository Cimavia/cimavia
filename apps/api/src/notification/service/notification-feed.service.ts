import type { NotificationDto, UnreadCountDto } from "@cmv/shared";
import { NOTIFICATION_PAGE_SIZE, parseReminderFeedId } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { toReminderFeedEntry } from "../../reminder/reminder.mapper";
import { ReminderService } from "../../reminder/service/reminder.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor, exercisedOrThrow } from "../../tenancy/tenant-context.type";
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
 * 1. **Tout est branché par rôle.** `Reminder` n'a pas de scope athlète : lire la table pour un
 *    athlète ne renverrait pas une liste vide, ça LÈVERAIT (fail closed) — et `GET /me/notifications`
 *    partirait en 500 pour tout athlète, sur un écran qui ne parle même pas de rappels. D'où
 *    `isCoach()` avant chaque accès.
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
      this.isCoach() ? this.reminders.listDue(now, NOTIFICATION_PAGE_SIZE) : [],
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
    const [notifications, dueReminders] = await Promise.all([
      this.db.notification.count({ where: { readAt: null } }),
      this.isCoach() ? this.reminders.countDueUnread(now) : 0,
    ]);
    return { count: notifications + dueReminders };
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
      await this.reminders.markAllDueRead(now);
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
    const reminder = await this.reminders.markDueRead(reminderId);
    if (reminder == null) {
      throw new NotFoundException("Notification introuvable");
    }
    return toReminderFeedEntry(reminder);
  }

  // Les rappels sont un outil du coach seul : c'est la capacité EXERCÉE, et non la donnée, qui
  // décide si la seconde source du centre existe. Un compte à double capacité qui ouvre son centre
  // « en tant qu'athlète » n'y voit donc pas ses rappels de coach — c'est l'intention.
  private isCoach(): boolean {
    return exercisedOrThrow(currentActor(this.cls)) === "coach";
  }
}
