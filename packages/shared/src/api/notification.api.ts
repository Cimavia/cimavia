import type {
  EmailableNotificationType,
  NotificationCategory,
  NotificationDto,
  NotificationEmailPreferenceDto,
  UnreadCountDto,
  UpdateNotificationEmailPreferencesInput,
} from "../dto/notification.schema";
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
  // Une entrée de cache par filtre (#694), toutes sous `all` : une invalidation de la racine les
  // fait tomber ensemble. `null` = « Toutes ».
  list: (category: NotificationCategory | null) =>
    [...notificationKeys.lists(), { category }] as const,
  // Le préfixe de toutes les listes filtrées, pour les périmer d'un geste sans toucher au badge.
  lists: () => ["notifications", "list"] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
};

/**
 * Clés de cache des RÉGLAGES (#65), séparées de celles des notifications elles-mêmes.
 *
 * Régler un canal ne change rien à ce qui a déjà été reçu : les fondre aurait fait réinvalider la
 * liste et le badge à chaque bascule d'interrupteur, pour rien.
 */
export const notificationPreferenceKeys = {
  all: ["notification-preferences"] as const,
};

export type NotificationApi = {
  /**
   * Les plus récentes d'abord, bornées côté API (`NOTIFICATION_PAGE_SIZE`). Filtrées par l'API
   * (#694) : la borne tombe APRÈS le filtre. `null` = toutes les catégories.
   */
  list: (category: NotificationCategory | null) => Promise<NotificationDto[]>;
  /** Servi à part de la liste : c'est le badge, rafraîchi en continu. */
  unreadCount: () => Promise<UnreadCountDto>;
  markRead: (id: string) => Promise<NotificationDto>;
  /** 204, pas de corps. Suit le filtre de la liste : n'éteint que ce qu'elle montre. */
  markAllRead: (category: NotificationCategory | null) => Promise<void>;
};

export function createNotificationApi(api: ApiClient): NotificationApi {
  return {
    list: (category) =>
      api.get<NotificationDto[]>(
        category == null ? "/me/notifications" : `/me/notifications?category=${category}`,
      ),
    unreadCount: () => api.get<UnreadCountDto>("/me/notifications/unread-count"),
    markRead: (id) => api.patch<NotificationDto>(`/me/notifications/${id}/read`),
    markAllRead: (category) =>
      api.post<void>("/me/notifications/read-all", category == null ? {} : { category }),
  };
}

/**
 * Réglages des notifications par e-mail (#65), partagés web ↔ mobile.
 *
 * La lecture rend la GRILLE complète — un état par type envoyable —, jamais la seule liste des
 * types actifs : l'écran affiche ce qu'on lui donne et n'a rien à déduire d'une absence.
 *
 * L'écriture remplace l'ENSEMBLE. Une bascule d'interrupteur envoie donc la liste entière, pas un
 * delta : l'écriture est idempotente, et deux bascules rapides ne peuvent pas s'écraser à moitié.
 */
export type NotificationPreferenceApi = {
  list: () => Promise<NotificationEmailPreferenceDto[]>;
  replace: (
    input: UpdateNotificationEmailPreferencesInput,
  ) => Promise<NotificationEmailPreferenceDto[]>;
};

export function createNotificationPreferenceApi(api: ApiClient): NotificationPreferenceApi {
  return {
    list: () => api.get<NotificationEmailPreferenceDto[]>("/me/notification-preferences"),
    replace: (input) =>
      api.put<NotificationEmailPreferenceDto[]>("/me/notification-preferences", input),
  };
}

/**
 * Ce que l'ENSEMBLE devient quand on bascule un type — la seule règle métier de cet écran, donc
 * ici plutôt que dupliquée dans les deux UI (`architecture-choice.md` §7).
 *
 * Rend un tableau prêt à envoyer : l'API attend la liste complète des types activés, pas un delta.
 * L'ordre suit la grille reçue, pour que deux bascules successives ne réordonnent pas la requête.
 */
export function toggledPreferences(
  grid: readonly NotificationEmailPreferenceDto[],
  type: EmailableNotificationType,
): EmailableNotificationType[] {
  return grid
    .filter((row) => (row.type === type ? !row.enabled : row.enabled))
    .map((row) => row.type);
}
