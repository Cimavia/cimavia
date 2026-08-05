import type { NotificationDto, UnreadCountDto } from "@cmv/shared";
import { NOTIFICATION_PAGE_SIZE } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toNotificationDto } from "../notification.mapper";

/**
 * Lecture du centre de notifications (#48) — la face « consultation » de ce que
 * `NotificationService` écrit à l'émission.
 *
 * Client TENANT ici, contrairement au service d'émission : on ne lit que ce qu'on a REÇU, et le
 * scope `recipientId` s'en porte garant pour les deux rôles. L'écriture, elle, vise le destinataire
 * — donc un autre tenant — et reste hors de ce client.
 */
@Injectable()
export class NotificationFeedService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  /**
   * Les plus récentes d'abord, bornées à `NOTIFICATION_PAGE_SIZE`. Un centre de notifications
   * montre ce qui vient d'arriver, pas un historique complet — d'où la borne plutôt qu'une
   * pagination (dette assumée, même famille que P2-2 / P5-1).
   */
  async list(): Promise<NotificationDto[]> {
    const rows = await this.db.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_PAGE_SIZE,
    });
    return rows.map(toNotificationDto);
  }

  /**
   * Servi à part de la liste : le badge se rafraîchit en continu (polling), la liste seulement
   * quand le panneau est ouvert. Compter, c'est un index ; lister, c'est des lignes.
   */
  async unreadCount(): Promise<UnreadCountDto> {
    const count = await this.db.notification.count({ where: { readAt: null } });
    return { count };
  }

  /**
   * Marque une notification lue. Idempotent, et surtout NON redaté : rouvrir une notification déjà
   * lue ne doit pas la faire remonter comme fraîche (même règle que le marquage des débriefs).
   */
  async markRead(id: string): Promise<NotificationDto> {
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
    await this.db.notification.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
  }
}
