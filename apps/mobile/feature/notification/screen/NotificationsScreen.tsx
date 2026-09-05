import { NOTIFICATION_LABEL_KEY, type NotificationDto, notificationSubject } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/feature/notification/hook/useNotifications";
import { routeForNotification } from "@/feature/notification/util/route.util";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { formatFullDay, formatRelativeTime } from "@/shared/util/date.util";

/**
 * Centre de notifications (#50) : la trace de ce qui a été poussé en push. Le push est éphémère —
 * téléphone éteint, permission refusée, notification balayée — cet écran est ce qui reste.
 */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Les destinations dépendent des écrans dont ce rôle dispose, pas seulement du type de la cible.
  const capabilities = useCapabilities();
  const { data: notifications, isPending, isError, isRefetching, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Refetch à chaque passage au premier plan : c'est l'écran où l'on vient justement voir ce qui
  // est arrivé pendant qu'on regardait ailleurs — le cache persisté ne suffit pas.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const hasNotifications = notifications != null && notifications.length > 0;
  const hasUnread = (notifications ?? []).some((notification) => notification.readAt == null);

  /**
   * Marquer lue AU TOUCHER, pas à l'ouverture de l'écran : vider le badge parce qu'on a jeté un
   * œil ferait disparaître le signal avant qu'il ait servi.
   *
   * Puis on **invalide tout le cache** avant de naviguer. Une notification ne dit pas seulement
   * « va là » : elle dit « l'état serveur a changé », donc ce qui est déjà en cache est périmé.
   * Le cache mobile est PERSISTÉ et frais 5 min : sans cette invalidation, on atterrirait sur un
   * planning ou un fil affichant précisément la version d'avant l'événement qu'on vient
   * d'annoncer.
   */
  function onSelect(notification: NotificationDto) {
    if (notification.readAt == null) markRead.mutate(notification.id);
    queryClient.invalidateQueries();
    const target = routeForNotification(notification, capabilities);
    if (target != null) router.push(target);
  }

  return (
    <CmvScreen>
      <OfflineBanner />

      <View className="flex-row items-center justify-between gap-2 px-4 pt-4">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {t("notification.title")}
        </CmvText>
        {hasUnread ? (
          <Pressable onPress={() => markAllRead.mutate()} hitSlop={8}>
            <CmvText className="text-cmv-accent-on text-sm">
              {t("notification.markAllRead")}
            </CmvText>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-4 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            // Le spinner est natif : il ignore les className, d'où la valeur (issue des tokens).
            tintColor={cmvColors.accent.DEFAULT}
          />
        }
      >
        {isPending ? <ActivityIndicator /> : null}

        {isError && notifications == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {!isPending && !isError && !hasNotifications ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{t("notification.empty.title")}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">
              {t("notification.empty.description")}
            </CmvText>
          </View>
        ) : null}

        {(notifications ?? []).map((notification) => (
          <NotificationCard key={notification.id} notification={notification} onSelect={onSelect} />
        ))}
      </ScrollView>
    </CmvScreen>
  );
}

type NotificationCardProps = {
  notification: NotificationDto;
  onSelect: (notification: NotificationDto) => void;
};

function NotificationCard({ notification, onSelect }: Readonly<NotificationCardProps>) {
  const { t } = useTranslation();
  const isUnread = notification.readAt == null;

  // Le libellé est rendu ICI, pas stocké : c'est ce qui permettra à une notification déjà reçue
  // de s'afficher en anglais le jour où en.json arrive. `actorName` peut manquer (utilisateur
  // introuvable à l'émission) — on nomme alors personne plutôt que d'afficher un trou.
  // Le sujet passe par `notificationSubject` : il peut être une VALEUR (note du coach, titre de
  // cycle), une CLÉ à traduire (motif d'un rappel auto-généré, #47) ou une DATE à mettre en forme
  // (journée réordonnée, #148). La précédence vit dans @cmv/shared pour que les deux clients ne la
  // réécrivent pas chacun de son côté.
  const label = t(NOTIFICATION_LABEL_KEY[notification.type], {
    actor: notification.actorName ?? t("notification.someone"),
    subject: notificationSubject(notification, t, formatFullDay) ?? "—",
  });

  return (
    <Pressable
      onPress={() => onSelect(notification)}
      className={
        isUnread
          ? "flex-row gap-3 rounded-lg border border-cmv-accent-line bg-cmv-bg-1 p-4"
          : "flex-row gap-3 rounded-lg border border-cmv-border bg-cmv-bg-1 p-4"
      }
    >
      {/* La pastille marque le non-lu ; l'espace reste pris pour que les cartes s'alignent. */}
      <View
        className={
          isUnread
            ? "mt-1.5 size-2 rounded-full bg-cmv-accent"
            : "mt-1.5 size-2 rounded-full bg-transparent"
        }
      />
      <View className="flex-1 gap-1">
        <CmvText className="text-cmv-text-hi">{label}</CmvText>
        <CmvText className="text-cmv-text-lo text-xs">
          {formatRelativeTime(notification.createdAt)}
        </CmvText>
      </View>
    </Pressable>
  );
}
