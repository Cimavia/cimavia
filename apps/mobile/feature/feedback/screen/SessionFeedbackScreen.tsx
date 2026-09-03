import type { MediaRecapLine, ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { myFeedbackKeys } from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useMyCoach } from "@/feature/coach";
import { FeedbackMediaSection } from "@/feature/feedback/component/FeedbackMediaSection";
import {
  FeedbackReplyComposer,
  FeedbackReplyMessages,
} from "@/feature/feedback/component/FeedbackReplySection";
import { FeedbackTextSection } from "@/feature/feedback/component/FeedbackTextSection";
import { FeedbackTrackingSection } from "@/feature/feedback/component/FeedbackTrackingSection";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSessionFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { useMyConversation } from "@/feature/message/hook/useConversation";
import { useLocalTracking } from "@/feature/plan/hook/useLocalTracking";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

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
  const { data: user } = authClient.useSession();

  const queryClient = useQueryClient();
  // Un athlète sans coach n'a pas de fil à ouvrir — l'API refuserait. Les hooks partent
  // inconditionnellement : c'est `enabled` et `feedbackId: null` qui disent l'attente.
  const { data: coach } = useMyCoach();
  const conversation = useMyConversation(coach != null);
  const reply = useFeedbackReply({
    feedbackId: feedback?.id ?? null,
    conversationId: conversation.data?.id,
    isThreadError: conversation.isError,
    // Son PROPRE débrief, pas la boîte du coach : c'est là que la réponse doit réapparaître.
    onSent: () => queryClient.invalidateQueries({ queryKey: myFeedbackKeys.detail(id) }),
  });

  const [preUploadErrorKey, setPreUploadErrorKey] = useState<string | null>(null);
  const [recap, setRecap] = useState<readonly MediaRecapLine[]>([]);

  return (
    <CmvScreen>
      {/* La barre de réponse est un PLANCHER d'écran, frère de la zone défilante : dedans, elle
          descendrait sous le contenu et passerait sous le clavier. Même montage que la messagerie
          et que le détail côté coach. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
                <TrackedSections
                  sessionId={id}
                  session={session.data}
                  feedback={feedback ?? null}
                />
              )}

              <FeedbackMediaSection sessionId={id} feedback={feedback ?? null} />

              {/* La conversation avec le coach, LÀ OÙ ELLE A COMMENCÉ. Rien tant que le débrief
                  n'existe pas : on ne répond pas à ce qu'on n'a pas encore écrit. */}
              {feedback == null ? null : (
                <FeedbackReplyMessages
                  messages={feedback.messages}
                  currentUserId={user?.user.id ?? ""}
                />
              )}
            </>
          )}
        </ScrollView>

        {/* ⚠️ Lire ici ne marque RIEN comme lu : `markRead` est par FIL, pas par message, et
            l'appeler éteindrait des non-lus que l'athlète n'a jamais vus (tranché en #190). */}
        {feedback == null ? null : (
          <FeedbackReplyComposer
            reply={reply}
            preUploadErrorKey={preUploadErrorKey}
            onPreUploadError={setPreUploadErrorKey}
            recap={recap}
            onRecap={setRecap}
          />
        )}
      </KeyboardAvoidingView>
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
