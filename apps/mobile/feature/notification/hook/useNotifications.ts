import type { NotificationDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationApi, notificationKeys } from "@/feature/notification/api";

/**
 * Le badge vit sur la barre d'onglets, donc sur tous les écrans. `refetchInterval` s'interrompt de
 * lui-même quand l'app passe en arrière-plan : le `focusManager` branché sur `AppState`
 * (shared/lib/query.tsx) le met en pause — sinon on interrogerait l'API téléphone en poche.
 */
const UNREAD_POLL_MS = 30_000;

export function useUnreadNotificationCount() {
  return useQuery<number>({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () => (await notificationApi.unreadCount()).count,
    refetchInterval: UNREAD_POLL_MS,
  });
}

// La liste elle-même se rafraîchit à l'ouverture de l'écran (`useFocusEffect` côté écran), comme
// les factures : pas de polling sur des données qu'on ne regarde pas.
export function useNotifications() {
  return useQuery<NotificationDto[]>({
    queryKey: notificationKeys.list(),
    queryFn: notificationApi.list,
  });
}

/**
 * Marquage au clic. On invalide la clé RACINE : la liste (la ligne perd sa pastille) et le
 * compteur (le badge décrémente) en dépendent tous les deux.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
