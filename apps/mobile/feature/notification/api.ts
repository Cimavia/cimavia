import type {
  NotificationDto,
  PushTokenDto,
  RegisterPushTokenInput,
  UnreadCountDto,
} from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Clés de cache — persistées sur le disque comme le reste : rouvrir l'app hors réseau doit
// afficher la dernière liste connue plutôt qu'un écran vide.
export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => ["notifications", "list"] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
};

// ── Centre de notifications (#50) ────────────────────────────────────────────

// Les plus récentes d'abord, bornées côté API (NOTIFICATION_PAGE_SIZE).
export function listNotifications(): Promise<NotificationDto[]> {
  return api.get<NotificationDto[]>("/me/notifications");
}

// Servi à part de la liste : c'est le badge de l'onglet, rafraîchi en continu.
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

// ── Appareils (push) ─────────────────────────────────────────────────────────

// Enregistre l'appareil courant. Idempotent côté API : rejouable à chaque démarrage.
export function registerPushToken(input: RegisterPushTokenInput): Promise<PushTokenDto> {
  return api.post<PushTokenDto>("/me/push-tokens", input);
}

// Révoque à la déconnexion : sans ça, l'appareil continuerait de recevoir les notifications
// d'un compte auquel il n'est plus connecté.
export function revokePushToken(token: string): Promise<void> {
  return api.delete<void>(`/me/push-tokens/${encodeURIComponent(token)}`);
}
