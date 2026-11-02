import {
  NOTIFICATION_LABEL_KEY,
  type NotificationCategoryType,
  type NotificationDto,
  notificationFilterChoices,
  notificationSubject,
  parseReminderFeedId,
} from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NotificationCategoryFilter } from "@/feature/notification/component/NotificationCategoryFilter";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/feature/notification/hook/useNotifications";
import { routeForNotification } from "@/feature/notification/util/route.util";
import { SnoozeReminderButton } from "@/feature/reminder/component/SnoozeReminderButton";
import { CmvButton } from "@/shared/component";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { cn } from "@/shared/util/cn.util";
import { formatFullDay, formatRelativeTime } from "@/shared/util/date.util";

type NotificationCenterProps = {
  /** `null` = « Toutes ». Tenu par la cloche : il survit au passage d'un conteneur à l'autre. */
  category: NotificationCategoryType | null;
  onCategoryChange: (category: NotificationCategoryType | null) => void;
  onClose: () => void;
  /**
   * Le badge a-t-il du non-lu ? Lu par la cloche, qui l'affiche : un second abonné relirait le
   * compteur à chaque ouverture.
   */
  hasUnread: boolean;
  /** Faux dans le panneau latéral, dont l'en-tête porte déjà le titre. */
  showTitle: boolean;
  /** La bascule entre les deux conteneurs, en bout de barre. */
  layoutToggle: ReactNode;
};

/**
 * Le contenu du centre de notifications — barre, filtres, liste —, écrit UNE fois et rendu par
 * l'un ou l'autre conteneur de la cloche (#695) : le panneau déroulant ou le panneau latéral.
 * Monté seulement à l'ouverture : la liste ne se charge pas avant, le badge suffit à savoir qu'il
 * se passe quelque chose.
 */
export function NotificationCenter({
  category,
  onCategoryChange,
  onClose,
  hasUnread,
  showTitle,
  layoutToggle,
}: Readonly<NotificationCenterProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // La destination d'une notification dépend des écrans dont ce rôle dispose, pas seulement du
  // type de la cible : sans ça, un athlète serait envoyé vers le builder du coach.
  const capabilities = useCapabilities();

  const { data: notifications, isPending, isError, refetch } = useNotifications(true, category);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

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
    onClose();
    if (notification.readAt == null) markRead.mutate(notification.id);
    queryClient.invalidateQueries();
    const target = routeForNotification(notification, capabilities);
    if (target != null) navigate(target);
  }

  // Sous un filtre, le badge global ne dit plus rien de la liste : le bouton suit ce qu'elle montre,
  // sans quoi il s'offrirait sur une catégorie déjà toute lue.
  const offersMarkAll =
    category == null
      ? hasUnread
      : (notifications ?? []).some((notification) => notification.readAt == null);

  return (
    // `h-full` + `min-h-0` : la liste défile seule, la barre et les filtres restent en place.
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-cmv-sm border-cmv-border border-b px-cmv-md py-cmv-sm">
        <span className="flex-1 text-cmv-body text-cmv-text-hi">
          {showTitle ? t("notification.title") : null}
        </span>
        {offersMarkAll ? (
          <CmvButton variant="ghost" onClick={() => markAllRead.mutate(category)}>
            {t("notification.markAllRead")}
          </CmvButton>
        ) : null}
        {layoutToggle}
      </header>
      <NotificationCategoryFilter
        choices={notificationFilterChoices(capabilities)}
        category={category}
        onChange={onCategoryChange}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <NotificationList
          notifications={notifications}
          isPending={isPending}
          isError={isError}
          emptyLabel={t(category == null ? "notification.empty" : "notification.emptyCategory")}
          onRetry={() => refetch()}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

type NotificationListProps = {
  notifications: NotificationDto[] | undefined;
  isPending: boolean;
  isError: boolean;
  // Le vide d'un filtre n'est pas le vide du centre : « rien dans cette catégorie », pas « rien ».
  emptyLabel: string;
  onRetry: () => void;
  onSelect: (notification: NotificationDto) => void;
};

function NotificationList({
  notifications,
  isPending,
  isError,
  emptyLabel,
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
    return <p className="p-cmv-lg text-center text-cmv-caption text-cmv-text-mid">{emptyLabel}</p>;
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
  //
  // Le sujet passe par `notificationSubject` : il peut être une VALEUR (note du coach, titre de
  // cycle), une CLÉ à traduire (motif d'un rappel auto-généré, #47) ou une DATE à mettre en forme
  // (journée réordonnée, #148). La précédence vit dans @cmv/shared pour que les deux clients ne la
  // réécrivent pas chacun de son côté.
  const label = t(NOTIFICATION_LABEL_KEY[notification.type], {
    actor: notification.actorName ?? t("notification.someone"),
    subject: notificationSubject(notification, t, formatFullDay) ?? "—",
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
