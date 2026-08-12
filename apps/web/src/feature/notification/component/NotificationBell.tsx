import { NOTIFICATION_LABEL_KEY, type NotificationDto, parseReminderFeedId } from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoNotificationsOutline } from "react-icons/io5";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/feature/notification/hook/useNotifications";
import { routeForNotification } from "@/feature/notification/util/route.util";
import { SnoozeReminderButton } from "@/feature/reminder/component/SnoozeReminderButton";
import { CmvButton } from "@/shared/component";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { cn } from "@/shared/util/cn.util";
import { formatRelativeTime } from "@/shared/util/date.util";

// Au-delà, le chiffre exact n'apporte plus rien et déforme la pastille.
const BADGE_MAX = 99;

/**
 * Cloche + badge + liste déroulante (#49). Posée dans `CmvAppShell`, donc visible de tous les
 * écrans : c'est la condition pour qu'une notification serve à quelque chose.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // La destination d'une notification dépend des écrans dont ce rôle dispose, pas seulement du
  // type de la cible : sans ça, un athlète serait envoyé vers le builder du coach.
  const capabilities = useCapabilities();
  const [open, setOpen] = useState(false);

  const { data: unreadCount } = useUnreadNotificationCount();
  // La liste ne se charge qu'à l'ouverture : le badge suffit à savoir qu'il se passe quelque chose.
  const { data: notifications, isPending, isError, refetch } = useNotifications(open);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Échap ferme le panneau, comme CmvPanel. Effet monté seulement quand il est ouvert.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /**
   * Marquer lue AU CLIC, pas à l'ouverture du panneau : vider le badge parce qu'on a jeté un œil
   * ferait disparaître le signal avant qu'il ait servi. Pour tout solder d'un coup, il y a le
   * bouton dédié.
   *
   * Puis on **invalide tout le cache** avant de naviguer. Une notification ne dit pas seulement
   * « va là » : elle dit « l'état serveur a changé », donc ce qui est déjà affiché est périmé.
   * Sans ça, cliquer « nouveau débrief » alors qu'on est DÉJÀ sur l'écran des débriefs ne fait
   * rien du tout — la navigation est un no-op et le `staleTime` d'une minute empêche le refetch.
   *
   * Invalidation globale plutôt qu'une table `entityType → clés` : énumérer les cibles
   * couplerait cette feature à toutes les autres, et ce couplage se périmerait en silence au
   * premier changement de route. Le clic est un geste rare, refetcher les quelques requêtes
   * montées ne coûte rien.
   */
  function onSelect(notification: NotificationDto) {
    setOpen(false);
    if (notification.readAt == null) markRead.mutate(notification.id);
    queryClient.invalidateQueries();
    const target = routeForNotification(notification, capabilities);
    if (target != null) navigate(target);
  }

  const hasUnread = unreadCount != null && unreadCount > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-label={t("notification.open")}
        aria-expanded={open}
        className="relative rounded-cmv-md p-cmv-sm text-cmv-text-mid transition-colors hover:bg-cmv-surface-hi hover:text-cmv-text-hi"
      >
        <IoNotificationsOutline size={20} />
        {hasUnread ? (
          <span className="-right-0.5 -top-0.5 absolute min-w-4 rounded-cmv-pill bg-cmv-accent px-1 text-cmv-caption text-cmv-text-hi leading-4">
            {unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Fond cliquable : ferme au clic en dehors, comme le slide-over du design system. */}
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-cmv-xs flex max-h-96 w-80 flex-col rounded-cmv-lg border border-cmv-border bg-cmv-bg-1 shadow-xl">
            <header className="flex items-center justify-between gap-cmv-sm border-cmv-border border-b px-cmv-md py-cmv-sm">
              <span className="text-cmv-body text-cmv-text-hi">{t("notification.title")}</span>
              {hasUnread ? (
                <CmvButton variant="ghost" onClick={() => markAllRead.mutate()}>
                  {t("notification.markAllRead")}
                </CmvButton>
              ) : null}
            </header>

            <div className="flex-1 overflow-y-auto">
              <NotificationList
                notifications={notifications}
                isPending={isPending}
                isError={isError}
                onRetry={() => refetch()}
                onSelect={onSelect}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

type NotificationListProps = {
  notifications: NotificationDto[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (notification: NotificationDto) => void;
};

function NotificationList({
  notifications,
  isPending,
  isError,
  onRetry,
  onSelect,
}: Readonly<NotificationListProps>) {
  const { t } = useTranslation();

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-cmv-sm p-cmv-lg text-center">
        <p className="text-cmv-caption text-cmv-text-mid">{t("common.errorTitle")}</p>
        <CmvButton variant="secondary" onClick={onRetry}>
          {t("common.retry")}
        </CmvButton>
      </div>
    );
  }
  if (isPending || notifications == null) {
    return (
      <p className="p-cmv-lg text-center text-cmv-caption text-cmv-text-mid">
        {t("common.loading")}
      </p>
    );
  }
  if (notifications.length === 0) {
    return (
      <p className="p-cmv-lg text-center text-cmv-caption text-cmv-text-mid">
        {t("notification.empty")}
      </p>
    );
  }

  return (
    <ul>
      {notifications.map((notification) => (
        <li key={notification.id}>
          <NotificationRow notification={notification} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

type NotificationRowProps = {
  notification: NotificationDto;
  onSelect: (notification: NotificationDto) => void;
};

function NotificationRow({ notification, onSelect }: Readonly<NotificationRowProps>) {
  const { t } = useTranslation();

  // Le libellé est rendu ICI, pas stocké : c'est ce qui permettra à la même ligne de s'afficher en
  // anglais le jour où en.json arrive. `actorName` peut manquer (utilisateur introuvable au moment
  // de l'émission) — on nomme alors personne plutôt que d'afficher un trou.
  const label = t(NOTIFICATION_LABEL_KEY[notification.type], {
    actor: notification.actorName ?? t("notification.someone"),
    subject: notification.subjectLabel ?? "—",
  });

  /**
   * Un rappel dû (#51) porte un id d'ENTRÉE préfixé, pas un id de table : c'est lui qui distingue
   * les deux sources du centre, et c'est le seul type sur lequel « repousser » a un sens (#105).
   * `null` = notification persistée ordinaire, aucun geste à offrir.
   */
  const reminderId = parseReminderFeedId(notification.id);

  /**
   * La ligne est un `div` et non un `button`, contrairement à sa première version : le report est
   * lui-même un bouton, et imbriquer deux boutons produit du HTML invalide (comportement de clic
   * indéfini, et le bouton interne devient inatteignable au clavier dans certains navigateurs).
   * Le survol et la bordure vivent donc sur le conteneur, la zone cliquable restant le `button`
   * interne qui porte le texte.
   */
  return (
    <div className="flex items-start gap-cmv-sm border-cmv-border border-b px-cmv-md py-cmv-sm transition-colors last:border-b-0 hover:bg-cmv-surface-hi">
      <button
        type="button"
        onClick={() => onSelect(notification)}
        className="flex flex-1 items-start gap-cmv-sm text-left"
      >
        {/* La pastille marque le non-lu ; l'espace reste réservé pour que les lignes s'alignent. */}
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-cmv-pill",
            notification.readAt == null ? "bg-cmv-accent" : "bg-transparent",
          )}
          aria-hidden="true"
        />
        <span className="flex flex-1 flex-col gap-cmv-xs">
          <span className="text-cmv-caption text-cmv-text-hi">{label}</span>
          <span className="text-cmv-caption text-cmv-text-mid">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </span>
      </button>

      {/* Le geste vient au rappel, plutôt que d'obliger à ouvrir « Mes rappels » pour décaler
          d'un jour ce qu'on vient de lire. Le panneau reste ouvert : l'entrée disparaît d'elle-même
          au refetch, le rappel n'étant plus dû. */}
      {reminderId == null ? null : <SnoozeReminderButton reminderId={reminderId} />}
    </div>
  );
}
