import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
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
import { formatDate } from "@/shared/util/date.util";

// `getRouteApi` plutôt qu'un import de `Route` : l'écran est importé PAR la route, l'inverse
// fermerait le cycle. Le typage des search params est conservé.
const route = getRouteApi("/feedbacks");

/**
 * Les débriefs reçus (p4-1) : ce que le coach lit entre deux séances de son athlète.
 * Ouvrir un débrief le marque comme lu — c'est ce qui alimente la tuile « à relire ».
 *
 * Le débrief ouvert est porté par l'URL (`?feedback=<id>`), pour que le tableau de suivi puisse
 * ouvrir directement le dernier non lu d'un athlète (#113). Conséquence : l'ouverture peut venir
 * d'un clic OU d'une URL, donc le marquage « lu » ne peut plus vivre dans le gestionnaire de clic —
 * il vit dans l'effet ci-dessous, seul chemin pour les deux cas.
 */
export function FeedbacksScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: feedbacks, isPending, isError, refetch } = useFeedbacks();
  const markRead = useMarkFeedbackRead();

  const { feedback: openedId } = route.useSearch();
  // Résolu depuis la liste : l'URL ne porte qu'un id, et le panneau a besoin du débrief entier.
  // `null` tant que la liste n'est pas là — le panneau s'ouvre dès qu'elle arrive.
  const opened = (feedbacks ?? []).find((feedback) => feedback.id === openedId) ?? null;

  const openFeedback = (feedback: CoachFeedbackSummaryDto) =>
    navigate({ to: "/feedbacks", search: { feedback: feedback.id } });
  const closeFeedback = () => navigate({ to: "/feedbacks", search: { feedback: undefined } });

  /**
   * Marquer à l'OUVERTURE, pas au survol ni au chargement de la liste : « lu » doit vouloir dire lu.
   * Idempotent côté API — rouvrir ne redate pas la lecture.
   *
   * Dépendances volontairement réduites à l'id et à l'état lu : `opened` est un objet reconstruit à
   * chaque rendu par le `find`, le mettre en dépendance relancerait l'effet en boucle.
   */
  const openedUnreadId = opened != null && opened.coachReadAt == null ? opened.id : null;
  useEffect(() => {
    if (openedUnreadId != null) markRead.mutate(openedUnreadId);
  }, [openedUnreadId, markRead.mutate]);

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

                <CmvButton variant="secondary" onClick={() => openFeedback(feedback)}>
                  {t("feedback.open")}
                </CmvButton>
              </div>
            </CmvCard>
          ))}
        </div>
      ) : null}

      <FeedbackDetailPanel feedback={opened} onClose={closeFeedback} />
    </CmvAppShell>
  );
}
