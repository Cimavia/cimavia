import type { ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { FeedbackMediaSection } from "@/feature/feedback/component/FeedbackMediaSection";
import { FeedbackTextSection } from "@/feature/feedback/component/FeedbackTextSection";
import { FeedbackTrackingSection } from "@/feature/feedback/component/FeedbackTrackingSection";
import { useSessionFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { useLocalTracking } from "@/feature/plan/hook/useLocalTracking";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";

/**
 * Débrief d'une séance (p4-1) : un champ texte libre + photos/vidéos, que l'athlète peut
 * reprendre plus tard.
 *
 * Écrire exige le réseau (pas d'écriture différée en MVP — CDC §12) : contrairement à la lecture
 * de la séance, on ne prétend pas fonctionner hors-ligne. L'échec est dit, pas masqué.
 *
 * L'écran ne fait que charger le débrief et disposer ses deux sections : le texte et les médias
 * ont chacun leurs mutations et leurs erreurs, qui ne se croisent jamais.
 */
export function SessionFeedbackScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: feedback, isPending, isError, refetch } = useSessionFeedback(id);
  const session = useScheduledSession(id);

  return (
    <CmvScreen>
      <ScrollView contentContainerClassName="gap-6 p-4">
        {isPending ? <ActivityIndicator /> : null}

        {isError ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {isPending || isError ? null : (
          <>
            <View className="gap-1">
              <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
                {t("feedback.title")}
              </CmvText>
              <CmvText className="text-cmv-text-mid text-sm">{t("feedback.subtitle")}</CmvText>
            </View>

            {/* Le décompte n'attend PAS la séance pour laisser écrire : si elle tarde ou échoue,
                le texte et les médias restent accessibles, seul le rappel des coches manque. */}
            {session.data == null ? (
              <FeedbackTextSection sessionId={id} feedback={feedback ?? null} />
            ) : (
              <TrackedSections sessionId={id} session={session.data} feedback={feedback ?? null} />
            )}

            <FeedbackMediaSection sessionId={id} feedback={feedback ?? null} />
          </>
        )}
      </ScrollView>
    </CmvScreen>
  );
}

/**
 * Le décompte et le texte, ENSEMBLE : ils partent dans le même enregistrement.
 *
 * Le suivi vit en local depuis la séance ; le débrief est le moment où il franchit le réseau. Un
 * seul bouton pour les deux — deux boutons feraient croire qu'on peut envoyer l'un sans l'autre,
 * alors que le décompte accompagne le ressenti.
 */
function TrackedSections({
  sessionId,
  session,
  feedback,
}: Readonly<{
  sessionId: string;
  session: ScheduledSessionDto;
  feedback: SessionFeedbackDto | null;
}>) {
  const remote = useMemo(
    () => Object.fromEntries(session.exercises.map((exercise) => [exercise.id, exercise.tracking])),
    [session],
  );
  const local = useLocalTracking(sessionId, remote);

  return (
    <>
      <FeedbackTrackingSection
        exercises={session.exercises}
        tracking={local.tracking}
        onToggleUnit={local.toggleUnit}
        onRounds={local.setRounds}
      />
      <FeedbackTextSection
        sessionId={sessionId}
        feedback={feedback}
        tracking={local.tracking}
        trackingDirty={local.dirty}
        onSaved={local.clear}
      />
    </>
  );
}
