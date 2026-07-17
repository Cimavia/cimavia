import { type CoachFeedbackSummaryDto, Role } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FeedbackDetailPanel } from "@/feature/feedback/component/FeedbackDetailPanel";
import { useFeedbacks, useMarkFeedbackRead } from "@/feature/feedback/hook/useFeedbacks";
import {
  CmvAppShell,
  CmvBadge,
  CmvButton,
  CmvCard,
  CmvEmptyState,
  CmvErrorState,
} from "@/shared/component";
import { authClient } from "@/shared/lib/auth";
import { formatDate } from "@/shared/util/date.util";

/**
 * Les débriefs reçus (p4-1) : ce que le coach lit entre deux séances de son athlète.
 * Ouvrir un débrief le marque comme lu — c'est ce qui alimente la tuile « à relire ».
 */
export function FeedbacksScreen() {
  const { t } = useTranslation();
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const { data: feedbacks, isPending, isError, refetch } = useFeedbacks();
  const markRead = useMarkFeedbackRead();

  const [opened, setOpened] = useState<CoachFeedbackSummaryDto | null>(null);

  if (isAuthPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  if (authSession?.user.role !== Role.COACH) {
    return <Navigate to="/" />;
  }

  function onOpen(feedback: CoachFeedbackSummaryDto) {
    setOpened(feedback);
    // Marquer à l'OUVERTURE, pas au survol ni au chargement de la liste : « lu » doit vouloir
    // dire lu. Idempotent côté API — rouvrir ne redate pas la lecture.
    if (feedback.coachReadAt == null) markRead.mutate(feedback.id);
  }

  // Erreur, vide et chargement sont trois états distincts : `feedbacks` est undefined dans les
  // deux premiers cas, et « Aucun débrief » sur une panne réseau serait un mensonge.
  const hasFeedbacks = feedbacks != null && feedbacks.length > 0;

  return (
    <CmvAppShell title={t("feedback.title")} subtitle={t("feedback.subtitle")}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {!isPending && !isError && !hasFeedbacks ? (
        <CmvEmptyState
          title={t("feedback.empty.title")}
          description={t("feedback.empty.description")}
        />
      ) : null}

      {hasFeedbacks ? (
        <div className="flex flex-col gap-cmv-sm">
          {feedbacks.map((feedback) => (
            <CmvCard key={feedback.id}>
              <div className="flex items-start gap-cmv-md">
                <div className="flex flex-1 flex-col gap-cmv-xs">
                  <div className="flex items-center gap-cmv-sm">
                    <h3 className="text-cmv-subtitle text-cmv-text-hi">{feedback.athleteName}</h3>
                    {feedback.coachReadAt == null ? (
                      <CmvBadge variant="accent">{t("feedback.unread")}</CmvBadge>
                    ) : null}
                    {feedback.mediaCount > 0 ? (
                      <CmvBadge>
                        {t("feedback.mediaCount", { count: feedback.mediaCount })}
                      </CmvBadge>
                    ) : null}
                  </div>

                  <p className="text-cmv-caption text-cmv-text-mid">
                    {feedback.sessionTitle} · {formatDate(feedback.scheduledDate)}
                  </p>

                  {/* Un aperçu, pas le débrief entier : le détail s'ouvre dans le panneau. */}
                  <p className="line-clamp-2 text-cmv-text-mid">{feedback.content ?? "—"}</p>
                </div>

                <CmvButton variant="secondary" onClick={() => onOpen(feedback)}>
                  {t("feedback.open")}
                </CmvButton>
              </div>
            </CmvCard>
          ))}
        </div>
      ) : null}

      <FeedbackDetailPanel feedback={opened} onClose={() => setOpened(null)} />
    </CmvAppShell>
  );
}
