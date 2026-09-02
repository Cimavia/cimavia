import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "@cmv/shared";
import { type FeedbackMediaDto, MediaType } from "@cmv/shared";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { coachFeedbackKeys } from "@/feature/feedback/api";
import { FeedbackReplySection } from "@/feature/feedback/component/FeedbackReplySection";
import { TrackedExerciseList } from "@/feature/feedback/component/TrackedExerciseList";
import {
  useCoachFeedbackDetail,
  useCoachFeedbacks,
  useMarkFeedbackRead,
} from "@/feature/feedback/hook/useCoachFeedbacks";
import { useFreshFeedbackMediaUrl } from "@/feature/feedback/hook/useFreshFeedbackMediaUrl";
import {
  CmvAudioPlayer,
  CmvErrorState,
  CmvImageViewer,
  CmvScreen,
  CmvText,
  CmvVideoLink,
} from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { formatFullDay } from "@/shared/util/date.util";

/**
 * Le débrief d'une séance, lu par le coach (#33) : texte et médias.
 *
 * Marqué lu À L'OUVERTURE, comme sur web — c'est le geste qui vaut lecture. Le marquage est
 * idempotent côté API, donc rouvrir ne redate rien.
 */
export function CoachFeedbackDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const { data: feedback, isPending, isError, refetch } = useCoachFeedbackDetail(sessionId);
  // Le résumé porte le nom de l'athlète et l'état lu ; le détail ne les a pas. La liste est déjà en
  // cache (on en vient), donc c'est gratuit.
  const { data: summaries } = useCoachFeedbacks();
  const summary = (summaries ?? []).find((item) => item.scheduledSessionId === sessionId) ?? null;

  const markRead = useMarkFeedbackRead();
  const { mutate: mark } = markRead;

  /**
   * Dépendances réduites à l'id et à l'état lu : `summary` est un objet reconstruit à chaque rendu,
   * le mettre en dépendance relancerait l'effet en boucle. Même raisonnement que côté web.
   */
  const unreadId = summary != null && summary.coachReadAt == null ? summary.id : null;
  useEffect(() => {
    if (unreadId != null) mark(unreadId);
  }, [unreadId, mark]);

  return (
    <CmvScreen>
      <OfflineBanner />

      <ScrollView contentContainerClassName="gap-4 p-4">
        {isPending ? <ActivityIndicator /> : null}
        {isError ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {isPending || isError ? null : (
          <FeedbackBody feedback={feedback ?? null} summary={summary} sessionId={sessionId} />
        )}
      </ScrollView>
    </CmvScreen>
  );
}

/**
 * Ce que le coach lit d'un débrief, puis ce qu'il en répond.
 *
 * Deux sources, et il faut les deux : le RÉSUMÉ porte l'athlète et la séance, le DÉTAIL porte le
 * texte, les médias et les réponses. Séparé de l'écran ci-dessus, qui ne tient que les trois états
 * de chargement.
 */
function FeedbackBody({
  feedback,
  summary,
  sessionId,
}: Readonly<{
  feedback: SessionFeedbackDto | null;
  summary: CoachFeedbackSummaryDto | null;
  sessionId: string;
}>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();

  return (
    <>
      <View className="gap-1">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {summary == null ? "—" : athleteLabel(summary.athleteId, summary.athleteName)}
        </CmvText>
        <CmvText className="text-cmv-text-mid text-sm">
          {summary == null
            ? "—"
            : `${summary.sessionTitle} · ${formatFullDay(summary.scheduledDate)}`}
        </CmvText>
      </View>

      {/* `null` = débrief sans texte : légitime, un débrief peut n'être que des médias. */}
      <CmvText className="text-cmv-text-hi">
        {feedback?.content ?? t("feedback.coach.mediaOnly")}
      </CmvText>

      {/* Le décompte ACCOMPAGNE le ressenti : il se lit juste après le texte, avant les médias,
          dans l'ordre où l'athlète l'a envoyé. */}
      <TrackedExerciseList exercises={feedback?.trackedExercises ?? []} />

      <FeedbackMedia media={feedback?.media ?? []} sessionId={sessionId} />

      {/* Après les médias : on répond APRÈS avoir tout lu, dans l'ordre où le débrief se parcourt.
          Sans l'un OU l'autre, on n'a pas de quoi écrire — ni le débrief à citer, ni l'athlète à
          qui l'envoyer. */}
      {feedback == null || summary == null ? null : (
        <FeedbackReplySection
          feedback={{ id: feedback.id, athleteId: summary.athleteId }}
          messages={feedback.messages}
        />
      )}
    </>
  );
}

/**
 * Les médias joints, un rendu par type.
 *
 * Le branchement est EXHAUSTIF, et pas « audio d'un côté, tout le reste en image » : c'est
 * exactement ce qui rendait une vidéo par `<Image>` — un bloc vide, sans erreur ni indice, là où
 * l'athlète avait déposé sa voie (#151).
 */
function FeedbackMedia({
  media,
  sessionId,
}: Readonly<{ media: readonly FeedbackMediaDto[]; sessionId: string }>) {
  const { t } = useTranslation();
  const freshUrl = useFreshFeedbackMediaUrl(coachFeedbackKeys.bySession(sessionId));

  if (media.length === 0) return null;

  return (
    <View className="gap-3 border-cmv-border border-t pt-4">
      <CmvText className="text-cmv-text-mid text-xs uppercase">{t("feedback.coach.media")}</CmvText>
      {media.map((item) => {
        if (item.type === MediaType.AUDIO) {
          return (
            <CmvAudioPlayer key={item.id} url={item.url} durationSeconds={item.durationSeconds} />
          );
        }
        if (item.type === MediaType.VIDEO) {
          return (
            <CmvVideoLink
              key={item.id}
              url={item.url}
              durationSeconds={item.durationSeconds}
              resolveUrl={() => freshUrl(item.id, item.url)}
              containerClassName="h-48 w-full items-center justify-center gap-2 rounded-lg border border-cmv-border bg-cmv-surface"
            />
          );
        }
        return (
          <CmvImageViewer
            key={item.id}
            url={item.url}
            containerClassName="h-48 w-full overflow-hidden rounded-lg"
          />
        );
      })}
    </View>
  );
}
