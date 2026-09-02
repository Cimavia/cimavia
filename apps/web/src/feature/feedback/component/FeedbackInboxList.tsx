import { type CoachFeedbackSummaryDto, comparableText } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvAvatar, CmvBadge, CmvEmptyState, CmvSegmented, CmvTextField } from "@/shared/component";
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
  search: string;
  onSearch: (search: string) => void;
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
  search,
  onSearch,
  onOpen,
}: Readonly<FeedbackInboxListProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();

  const unreadCount = feedbacks.filter((feedback) => feedback.coachReadAt == null).length;

  /**
   * Le filtre porte sur le NOM DE L'ATHLÈTE, pas sur le titre de séance ni sur le texte du
   * débrief : un coach qui cherche ici cherche quelqu'un, et élargir la recherche au contenu
   * ferait remonter des lignes sans que rien à l'écran n'explique pourquoi.
   *
   * `comparableText` des DEUX côtés — règle unique du dépôt : le coach tape « lea » et doit
   * trouver « Léa ». Exiger l'accent ferait échouer la recherche sur exactement les noms que le
   * clavier rend pénibles à écrire.
   */
  const needle = comparableText(search);
  const shown = feedbacks.filter(
    (feedback) =>
      (filter !== InboxFilter.UNREAD || feedback.coachReadAt == null) &&
      (needle === "" || comparableText(feedback.athleteName).includes(needle)),
  );

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
        {/* `type="search"` : le navigateur donne la croix d'effacement, qu'on n'a pas à redessiner. */}
        <CmvTextField
          label={t("feedback.inbox.searchLabel")}
          name="feedbackSearch"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t("feedback.inbox.searchPlaceholder")}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Trois vides, trois phrases. « Aucun résultat » sur une recherche, « tout est lu » sur
            le segment — dire « tout est lu » à quelqu'un qui vient de taper un nom introuvable
            serait une réponse à une question qu'il n'a pas posée. Le vide GÉNÉRAL, lui, est rendu
            par l'écran, avant même que cette colonne existe. */}
        {shown.length === 0 ? (
          <div className="p-cmv-lg">
            {needle === "" ? (
              <CmvEmptyState
                title={t("feedback.inbox.allRead.title")}
                description={t("feedback.inbox.allRead.description")}
              />
            ) : (
              <CmvEmptyState
                title={t("feedback.inbox.noMatch.title")}
                description={t("feedback.inbox.noMatch.description", { query: search.trim() })}
              />
            )}
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
                {/* « Répondu » est un BADGE, pas un troisième segment : c'est une information sur
                    la ligne, pas un axe de tri de plus. Dérivé côté serveur (`repliedAt`), donc
                    jamais à tenir cohérent ici. */}
                {feedback.repliedAt != null ? (
                  <CmvBadge variant="success">{t("feedback.replied")}</CmvBadge>
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
