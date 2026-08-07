import type { NotificationDto, UnreadCountDto } from "../dto/notification.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP du centre de notifications (#48), partagés web ↔ mobile.
 *
 * La plomberie HTTP n'a rien de spécifique à un client : mêmes routes, mêmes DTO, mêmes clés de
 * cache. Seule l'UI diffère. L'écrire deux fois, c'était garantir qu'un chemin change d'un côté
 * sans l'autre — et la règle de promotion du repo (architecture-choice §1) l'interdisait déjà.
 *
 * Le client est INJECTÉ plutôt qu'importé : chaque app construit le sien (cookie de navigateur
 * côté web, SecureStore côté mobile). Ce module ne connaît que le contrat `ApiClient`.
 */
export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => ["notifications", "list"] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
};

export type NotificationApi = {
  /** Les plus récentes d'abord, bornées côté API (`NOTIFICATION_PAGE_SIZE`). */
  list: () => Promise<NotificationDto[]>;
  /** Servi à part de la liste : c'est le badge, rafraîchi en continu. */
  unreadCount: () => Promise<UnreadCountDto>;
  markRead: (id: string) => Promise<NotificationDto>;
  /** 204, pas de corps. */
  markAllRead: () => Promise<void>;
};

export function createNotificationApi(api: ApiClient): NotificationApi {
  return {
    list: () => api.get<NotificationDto[]>("/me/notifications"),
    unreadCount: () => api.get<UnreadCountDto>("/me/notifications/unread-count"),
    markRead: (id) => api.patch<NotificationDto>(`/me/notifications/${id}/read`),
    markAllRead: () => api.post<void>("/me/notifications/read-all", {}),
  };
}
