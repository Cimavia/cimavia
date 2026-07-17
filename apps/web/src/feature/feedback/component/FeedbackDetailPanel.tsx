import { type CoachFeedbackSummaryDto, MediaType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { useSessionFeedback } from "@/feature/feedback/hook/useFeedbacks";
import { CmvButton, CmvPanel } from "@/shared/component";
import { formatDate } from "@/shared/util/date.util";

type FeedbackDetailPanelProps = {
  feedback: CoachFeedbackSummaryDto | null;
  onClose: () => void;
};

/**
 * Le débrief complet, médias inclus. Les URLs sont signées à durée courte et régénérées à chaque
 * lecture : le panneau recharge donc le détail plutôt que de réutiliser celles de la liste
 * (qui n'en porte d'ailleurs pas — elle ne compte que les médias).
 */
export function FeedbackDetailPanel({ feedback, onClose }: Readonly<FeedbackDetailPanelProps>) {
  const { t } = useTranslation();
  const { data: detail, isPending } = useSessionFeedback(feedback?.scheduledSessionId ?? "");

  if (feedback == null) return null;

  return (
    <CmvPanel
      open
      title={feedback.sessionTitle}
      description={t("feedback.detail.subtitle", {
        athlete: feedback.athleteName,
        date: formatDate(feedback.scheduledDate),
      })}
      onClose={onClose}
      size="lg"
      footer={
        <CmvButton variant="secondary" onClick={onClose}>
          {t("common.close")}
        </CmvButton>
      }
    >
      <div className="flex flex-col gap-cmv-lg">
        <section className="flex flex-col gap-cmv-xs">
          <h4 className="text-cmv-caption text-cmv-text-mid">{t("feedback.detail.content")}</h4>
          {/* Un débrief peut n'être que des médias : pas de texte inventé (règle nullable). */}
          <p className="whitespace-pre-wrap text-cmv-text-hi">{feedback.content ?? "—"}</p>
        </section>

        <section className="flex flex-col gap-cmv-sm">
          <h4 className="text-cmv-caption text-cmv-text-mid">
            {t("feedback.detail.media", { count: feedback.mediaCount })}
          </h4>

          {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

          <div className="grid gap-cmv-sm sm:grid-cols-2">
            {(detail?.media ?? []).map((media) =>
              media.type === MediaType.IMAGE ? (
                <a key={media.id} href={media.url} target="_blank" rel="noreferrer">
                  <img
                    src={media.url}
                    alt={media.fileName}
                    className="h-40 w-full rounded-cmv-md border border-cmv-border object-cover"
                  />
                </a>
              ) : (
                // Le navigateur streame depuis l'URL signée : rien ne transite par l'API.
                <video
                  key={media.id}
                  src={media.url}
                  controls
                  className="h-40 w-full rounded-cmv-md border border-cmv-border bg-cmv-bg-1"
                >
                  <track kind="captions" />
                </video>
              ),
            )}
          </div>
        </section>
      </div>
    </CmvPanel>
  );
}
