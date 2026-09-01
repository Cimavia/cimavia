import type { NotificationDto, UnreadCountDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationApi, notificationKeys } from "@/feature/notification/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

// Le badge vit dans la nav, donc sur TOUS les écrans : il s'interroge plus lentement qu'un fil de
// messages ouvert (10 s), une notification n'ayant pas la même urgence qu'une conversation en
// cours. `refetchOnWindowFocus` (défaut TanStack) complète l'intervalle.
const UNREAD_POLL_MS = 30_000;

export function useUnreadNotificationCount() {
  return useQuery<number>({
    queryKey: notificationKeys.unreadCount(),
    // `select` plutôt qu'une seconde requête : la ventilation par espace (#176) lit la MÊME
    // réponse, sous la même clé, à un seul rythme de polling.
    queryFn: async () => (await notificationApi.unreadCount()).count,
    refetchInterval: UNREAD_POLL_MS,
  });
}

/**
 * Le compteur VENTILÉ par espace (#176) — ce qui attend de chaque côté, pour la pastille du
 * basculeur. La cloche, elle, garde `useUnreadNotificationCount` : elle annonce un total, pas une
 * répartition.
 *
 * Même clé de cache que le total : c'est la MÊME requête, dont on lit deux projections. Deux clés
 * la feraient partir deux fois, à deux rythmes de polling.
 */
export function useUnreadByCapability() {
  return useQuery<UnreadCountDto>({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationApi.unreadCount(),
    refetchInterval: UNREAD_POLL_MS,
  });
}

/**
 * La liste n'est chargée QUE panneau ouvert : le badge suffit à savoir qu'il se passe quelque
 * chose, tirer 50 lignes en permanence sur chaque écran serait du gaspillage.
 */
export function useNotifications(enabled: boolean) {
  return useQuery<NotificationDto[]>({
    queryKey: notificationKeys.list(),
    queryFn: notificationApi.list,
    enabled,
  });
}

/**
 * Marquage au clic. On invalide les DEUX clés : la liste (l'entrée perd sa pastille) et le
 * compteur (le badge décrémente). Sans la seconde, le badge resterait faux jusqu'au prochain
 * intervalle de polling.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: toast.onError,
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: toast.onError,
  });
}
