import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvAvatar, CmvBadge, CmvEmptyState, CmvSegmented } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";

/** « Tous » ou « Non lus » — les deux segments de la maquette, rien de plus. */
export const InboxFilter = { ALL: "all", UNREAD: "unread" } as const;
export type InboxFilter = (typeof InboxFilter)[keyof typeof InboxFilter];

const FILTERS = [
  { value: InboxFilter.ALL, labelKey: "feedback.inbox.filter.all" },
  { value: InboxFilter.UNREAD, labelKey: "feedback.inbox.filter.unread" },
] as const;

type FeedbackInboxListProps = {
  feedbacks: readonly CoachFeedbackSummaryDto[];
  openedId: string | null;
  filter: InboxFilter;
  onFilter: (filter: InboxFilter) => void;
  onOpen: (feedback: CoachFeedbackSummaryDto) => void;
};

/**
 * La colonne de gauche de la boîte de réception : le compte de non-lus, les deux segments, puis
 * les débriefs reçus.
 *
 * Le titre « Débriefs » de la maquette n'est PAS repris ici : `CmvAppShell` le porte déjà en tête
 * de page, et l'écrire deux fois à dix centimètres d'écart ne dit rien de plus. Ce que la colonne
 * garde de la planche, c'est ce qu'elle seule sait : combien attendent, et sur quoi on filtre.
 */
export function FeedbackInboxList({
  feedbacks,
  openedId,
  filter,
  onFilter,
  onOpen,
}: Readonly<FeedbackInboxListProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();

  const unreadCount = feedbacks.filter((feedback) => feedback.coachReadAt == null).length;
  const shown =
    filter === InboxFilter.UNREAD
      ? feedbacks.filter((feedback) => feedback.coachReadAt == null)
      : feedbacks;

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden border-cmv-border border-r">
      <div className="flex flex-col gap-cmv-sm border-cmv-border border-b px-cmv-md py-cmv-md">
        <p className="text-cmv-caption text-cmv-text-mid">
          {t("feedback.inbox.unreadCount", { count: unreadCount })}
        </p>
        <CmvSegmented
          options={FILTERS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          value={filter}
          onChange={onFilter}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Filtrer jusqu'au vide n'est pas la même chose que ne rien avoir reçu : ici tout est lu,
            ce que la liste complète dément à un segment près. Le vide GÉNÉRAL est rendu par
            l'écran, avant même que cette colonne existe. */}
        {shown.length === 0 ? (
          <div className="p-cmv-lg">
            <CmvEmptyState
              title={t("feedback.inbox.allRead.title")}
              description={t("feedback.inbox.allRead.description")}
            />
          </div>
        ) : null}

        {shown.map((feedback) => (
          <button
            type="button"
            key={feedback.id}
            onClick={() => onOpen(feedback)}
            className={cn(
              "flex gap-cmv-sm border-cmv-border border-b px-cmv-md py-cmv-sm text-left transition-colors",
              feedback.id === openedId ? "bg-cmv-surface" : "hover:bg-cmv-surface",
            )}
          >
            <CmvAvatar name={feedback.athleteName} />

            <div className="flex min-w-0 flex-1 flex-col gap-cmv-xs">
              <div className="flex items-center gap-cmv-sm">
                <span className="flex-1 truncate text-cmv-body text-cmv-text-hi">
                  {athleteLabel(feedback.athleteId, feedback.athleteName)}
                </span>
                {feedback.coachReadAt == null ? (
                  <CmvBadge variant="accent">{t("feedback.unread")}</CmvBadge>
                ) : null}
              </div>

              <span className="truncate text-cmv-caption text-cmv-text-mid">
                {feedback.sessionTitle} · {formatDate(feedback.scheduledDate)}
              </span>

              {/* Un aperçu, pas le débrief entier — et « — » plutôt qu'un blanc : un débrief peut
                  n'être que des médias, ce qui est un état, pas une absence de ligne. */}
              <span className="line-clamp-2 text-cmv-caption text-cmv-text-lo">
                {feedback.content ?? "—"}
              </span>

              {feedback.mediaCount > 0 ? (
                <span className="text-cmv-caption text-cmv-text-lo">
                  {t("feedback.mediaCount", { count: feedback.mediaCount })}
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
