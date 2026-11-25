import {
  type CoachFeedbackSummaryDto,
  isEndedLink,
  type MediaRecapLine,
  type SessionFeedbackDto,
} from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { coachFeedbackKeys } from "@/feature/feedback/api";
import { FeedbackMediaList } from "@/feature/feedback/component/FeedbackMediaList";
import {
  FeedbackReplyComposer,
  FeedbackReplyMessages,
  FeedbackReplySelf,
} from "@/feature/feedback/component/FeedbackReplySection";
import { TrackedBlockList } from "@/feature/feedback/component/TrackedBlockList";
import {
  useCoachFeedbackDetail,
  useCoachFeedbacks,
  useMarkFeedbackRead,
} from "@/feature/feedback/hook/useCoachFeedbacks";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useConversationWith } from "@/feature/message/hook/useConversation";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { useAthleteLabel, useIsSelfAthlete } from "@/shared/hook/useAthleteLabel";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { useLatch } from "@/shared/hook/useLatch";
import { authClient } from "@/shared/lib/auth";
import { formatFullDay } from "@/shared/util/date.util";

/**
 * Le débrief d'une séance, lu par le coach (#33) — et, depuis #194, ce qu'il en répond.
 *
 * Marqué lu À L'OUVERTURE, comme sur web : c'est le geste qui vaut lecture. Le marquage est
 * idempotent côté API, donc rouvrir ne redate rien.
 */
export function CoachFeedbackDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const { data: feedback, isPending, isError, refetch } = useCoachFeedbackDetail(sessionId);
  // Une relecture ratée, 401 compris (#439), ne doit pas démonter la réponse en cours de saisie.
  const failed = isError && feedback === undefined;
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

      {isPending || failed ? (
        <View className="flex-1 items-center justify-center p-4">
          {isPending ? <ActivityIndicator /> : <CmvErrorState onRetry={() => refetch()} />}
        </View>
      ) : (
        <FeedbackBody feedback={feedback ?? null} summary={summary} sessionId={sessionId} />
      )}
    </CmvScreen>
  );
}

/**
 * Ce que le coach lit d'un débrief, puis ce qu'il en répond.
 *
 * La barre d'envoi est un FRÈRE de la zone défilante, pas son dernier enfant : c'est un plancher
 * d'écran, comme dans la messagerie. Dedans, elle descendait sous le contenu, s'arrêtait au padding
 * de la page et passait sous le clavier.
 *
 * `KeyboardAvoidingView` vient de `react-native-keyboard-controller` (pas de RN) : il gère Android
 * edge-to-edge, là où le natif reste inerte. Même montage que `ConversationThread`.
 *
 * Deux sources, et il faut les deux : le RÉSUMÉ porte l'athlète et la séance, le DÉTAIL porte le
 * texte, les médias et les réponses.
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
  const { data: session } = authClient.useSession();

  const isSelf = useIsSelfAthlete()(summary?.athleteId ?? "");
  const closedNote = useClosedReplyNote(summary?.athleteId ?? null);

  // Les hooks sont appelés INCONDITIONNELLEMENT : la barre vit au niveau de la mise en page, donc
  // avant que le débrief soit chargé. `null` dit l'attente, plutôt qu'un appel sous condition.
  // Et `null` AUSSI sur son propre débrief : la requête prendrait un 409 (#198), affiché en
  // « réessaie dans un instant » — une panne passagère qui n'en est pas une. Pas davantage tant
  // qu'on ignore si le suivi court, ni sur un suivi terminé : rien ne s'y écrira, et le get-or-create
  // rendrait le fil pour rien — ou un 400 s'il n'a jamais existé.
  const conversation = useConversationWith(
    isSelf || closedNote !== null ? null : (summary?.athleteId ?? null),
  );
  const queryClient = useQueryClient();
  const freshMediaUrl = useFreshMediaUrl(coachFeedbackKeys.bySession(sessionId));
  const reply = useFeedbackReply(
    {
      feedbackId: feedback?.id ?? null,
      conversationId: conversation.data?.id,
      isThreadError: conversation.isError,
      // La liste ENTIÈRE et pas seulement ce débrief : `firstReply` y vit aussi, et c'est lui qui
      // dira « répondu » sur la ligne qu'on vient de traiter.
      onSent: () => queryClient.invalidateQueries({ queryKey: coachFeedbackKeys.all }),
    },
    // Le débrief d'un de ses athlètes, donc en coach — quel que soit le sélecteur (#343).
    "coach",
  );

  // Refus qui PRÉCÈDE l'upload (permission galerie, permission/erreur micro) : porté à la main, il
  // ne passe par aucune mutation. Réinitialisé à chaque nouvelle tentative.
  const [preUploadErrorKey, setPreUploadErrorKey] = useState<string | null>(null);
  // Ce qui n'a pas pu partir au dernier lot, fichier par fichier.
  const [recap, setRecap] = useState<readonly MediaRecapLine[]>([]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerClassName="gap-4 p-4">
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
        <TrackedBlockList blocks={feedback?.trackedBlocks ?? []} />

        <FeedbackMediaList media={feedback?.media ?? []} resolveMediaUrl={freshMediaUrl} />

        {isSelf ? (
          <FeedbackReplySelf />
        ) : (
          <FeedbackReplyMessages
            messages={feedback?.messages ?? []}
            currentUserId={session?.user.id ?? ""}
            resolveMediaUrl={freshMediaUrl}
          />
        )}
      </ScrollView>

      {isSelf ? null : (
        <ReplyFloor closedNote={closedNote}>
          <FeedbackReplyComposer
            reply={reply}
            preUploadErrorKey={preUploadErrorKey}
            onPreUploadError={setPreUploadErrorKey}
            recap={recap}
            onRecap={setRecap}
          />
        </ReplyFloor>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * Le plancher de la réponse : le composeur, ou ce qui se dit à sa place sur un suivi terminé. Rien
 * tant qu'on l'ignore (`undefined`) : son champ s'éditerait, et l'arrivée d'un suivi terminé le
 * retirerait avec la frappe.
 */
function ReplyFloor({
  closedNote,
  children,
}: Readonly<{ closedNote: string | null | undefined; children: ReactNode }>) {
  if (closedNote === undefined) return null;
  if (closedNote === null) return children;
  return (
    <View className="border-cmv-border border-t bg-cmv-surface p-4">
      <CmvText className="text-cmv-text-mid text-sm">{closedNote}</CmvText>
    </View>
  );
}

/**
 * Le suivi de CE Coach avec l'athlète a-t-il pris fin (#911, pendant du web de #910) ? Rend ce qui
 * se dit alors à la place du composeur, `null` sur un suivi qui court, et `undefined` tant qu'on ne
 * le sait pas : ni composeur ni fil demandé. On ne le sait pas tant que le résumé n'a pas dit QUEL
 * athlète, ni tant que ses liens se lisent pour la première fois.
 *
 * Illisibles, ou en pause hors ligne sans cache, les liens ne tranchent plus rien (`null`) : le fil
 * se demande comme avant, et l'API refuse en 409 l'envoi d'un suivi terminé — mieux qu'un plancher
 * vide sans raison ni relance. Une fois su, ça ne se désapprend pas sur une relance : TanStack
 * remet une liste sans donnée en `pending` à chaque relecture, et le composeur partirait avec sa
 * frappe. C'est le lien qui compte, pas le cycle : un débrief d'un cycle partagé (#610) se répond
 * par le fil de chaque Coach avec l'athlète.
 */
function useClosedReplyNote(athleteId: string | null): string | null | undefined {
  const { t } = useTranslation();
  const { data: links, isError, fetchStatus } = useAthletes();
  const followEndedText = useFollowEndedText();
  const settled = useLatch(athleteId ?? "", links != null || isError || fetchStatus === "paused");
  if (athleteId == null || !settled) return undefined;
  const link = links?.find((candidate) => candidate.athleteId === athleteId);
  if (link == null || !isEndedLink(link)) return null;
  return t("feedback.reply.followEnded", { ended: followEndedText(link.endedAt) });
}
