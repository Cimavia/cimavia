import type { NotificationDto, UnreadCountDto } from "@cmv/shared";
import { api } from "@/shared/lib/api";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => ["notifications", "list"] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
};

// Les plus récentes d'abord, bornées côté API (NOTIFICATION_PAGE_SIZE).
export function listNotifications(): Promise<NotificationDto[]> {
  return api.get<NotificationDto[]>("/me/notifications");
}

// Servi à part de la liste : c'est le badge, rafraîchi en continu.
export function getUnreadCount(): Promise<UnreadCountDto> {
  return api.get<UnreadCountDto>("/me/notifications/unread-count");
}

export function markNotificationRead(id: string): Promise<NotificationDto> {
  return api.patch<NotificationDto>(`/me/notifications/${id}/read`);
}

// 204, pas de corps.
export function markAllNotificationsRead(): Promise<void> {
  return api.post<void>("/me/notifications/read-all", {});
}
