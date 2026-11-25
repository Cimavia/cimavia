import type { MediaRecapLine, ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { canDebrief, feedbackTrackingInput, myFeedbackKeys } from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { type ComponentProps, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { FeedbackBlocksSection } from "@/feature/feedback/component/FeedbackBlocksSection";
import { FeedbackMediaList } from "@/feature/feedback/component/FeedbackMediaList";
import { FeedbackMediaSection } from "@/feature/feedback/component/FeedbackMediaSection";
import {
  FeedbackReplyComposer,
  FeedbackReplyMessages,
  FeedbackReplySelf,
} from "@/feature/feedback/component/FeedbackReplySection";
import { FeedbackTextSection } from "@/feature/feedback/component/FeedbackTextSection";
import { TrackedBlockList } from "@/feature/feedback/component/TrackedBlockList";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSessionFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import type { ResolveMediaUrl } from "@/feature/message/component/MessageBubble";
import { useConversationWithCoach } from "@/feature/message/hook/useConversation";
import { useLocalBlockTracking } from "@/feature/plan/hook/useLocalBlockTracking";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { useIsSelfAthlete } from "@/shared/hook/useAthleteLabel";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { useLatch } from "@/shared/hook/useLatch";
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
 *
 * Suivi terminé (#911) : le débrief se relit, plus rien ne s'y écrit. La séance le dit, et le
 * formulaire attend sa réponse — offert puis retiré à son arrivée, il emporterait la frappe (même
 * choix que le web, #910). Illisible, elle ne ferme rien : elle fait perdre le rappel des coches,
 * pas le droit d'écrire (#722), et l'API refuse en 409 l'envoi d'un suivi terminé.
 */
export function SessionFeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feedback, refetch, session, isLoading, failed, closed } = useFeedbackState(id);
  const { data: user } = authClient.useSession();
  const ready = !isLoading && !failed;

  const queryClient = useQueryClient();
  // Les hooks partent inconditionnellement : c'est un coach inconnu et `feedbackId: null` qui
  // disent l'attente.
  const { isSelf, conversation } = useSessionThread(session.data);
  const freshMediaUrl = useFreshMediaUrl(myFeedbackKeys.detail(id));
  const reply = useFeedbackReply(
    {
      feedbackId: feedback?.id ?? null,
      conversationId: conversation.data?.id,
      isThreadError: conversation.isError,
      // Son PROPRE débrief, pas la boîte du coach : c'est là que la réponse doit réapparaître.
      onSent: () => queryClient.invalidateQueries({ queryKey: myFeedbackKeys.detail(id) }),
    },
    // Son débrief, donc en athlète — quel que soit le sélecteur (#343).
    "athlete",
  );

  const [preUploadErrorKey, setPreUploadErrorKey] = useState<string | null>(null);
  const [recap, setRecap] = useState<readonly MediaRecapLine[]>([]);

  return (
    <CmvScreen>
      {/* La barre de réponse est un PLANCHER d'écran, frère de la zone défilante : dedans, elle
          descendrait sous le contenu et passerait sous le clavier. Même montage que la messagerie
          et que le détail côté coach. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerClassName="gap-6 p-4">
          {isLoading ? <ActivityIndicator /> : null}

          {failed ? <CmvErrorState onRetry={() => refetch()} /> : null}

          {ready && closed != null ? (
            <ClosedFeedback
              session={closed}
              feedback={feedback ?? null}
              currentUserId={user?.user.id ?? ""}
              resolveMediaUrl={freshMediaUrl}
            />
          ) : null}

          {ready && closed == null ? (
            <OpenFeedback
              sessionId={id}
              session={session.data ?? null}
              feedback={feedback ?? null}
              isSelf={isSelf}
              currentUserId={user?.user.id ?? ""}
              resolveMediaUrl={freshMediaUrl}
            />
          ) : null}
        </ScrollView>

        {/* ⚠️ Lire ici ne marque RIEN comme lu : `markRead` est par FIL, pas par message, et
            l'appeler éteindrait des non-lus que l'athlète n'a jamais vus (tranché en #190). */}
        {feedback == null || isSelf || !ready || closed != null ? null : (
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
 * Ce que l'écran lit avant de rien rendre : le débrief et sa séance.
 *
 * `failed` regarde `undefined` et non `null`, qui veut dire « pas encore de débrief » : une
 * relecture ratée, 401 compris (#439), ne doit pas démonter le texte en cours de saisie. `closed`
 * est la séance dont le suivi a pris fin (#911), `null` tant qu'elle se débriefe — ou qu'elle n'est
 * pas lue.
 *
 * La séance ne fait attendre que sa PREMIÈRE lecture, et seulement en vol : hors ligne et sans
 * cache, elle est en pause pour de bon, et l'attendre laisserait l'écran sur un spinner — le
 * formulaire s'offre alors comme si elle avait échoué. Offert, il ne se retire plus pour une
 * relance : TanStack remet une séance sans donnée en `pending` à chaque relecture (retour au
 * premier plan, réseau revenu, invalidation après un média), et la frappe partirait avec lui.
 */
function useFeedbackState(id: string) {
  const { data: feedback, isPending, isError, refetch } = useSessionFeedback(id);
  const session = useScheduledSession(id);
  const sessionKnown = useLatch(id, !session.isPending || session.fetchStatus === "paused");
  const failed = isError && feedback === undefined;
  return {
    feedback,
    refetch,
    session,
    // Jamais avec `failed` : la séance peut être encore en vol quand le débrief a déjà échoué, et
    // l'écran montrerait à la fois l'attente et la panne.
    isLoading: !failed && (isPending || !sessionKnown),
    failed,
    closed: session.data != null && !canDebrief(session.data) ? session.data : null,
  };
}

/**
 * Le débrief qui s'écrit encore : le texte et les coches, les médias, puis la conversation avec le
 * coach, LÀ OÙ ELLE A COMMENCÉ — rien tant que le débrief n'existe pas : on ne répond pas à ce
 * qu'on n'a pas encore écrit.
 */
function OpenFeedback({
  sessionId,
  session,
  feedback,
  isSelf,
  currentUserId,
  resolveMediaUrl,
}: Readonly<{
  sessionId: string;
  session: ScheduledSessionDto | null;
  feedback: SessionFeedbackDto | null;
  isSelf: boolean;
  currentUserId: string;
  resolveMediaUrl: ResolveMediaUrl;
}>) {
  const { t } = useTranslation();

  return (
    <>
      <FeedbackHeading subtitle={t("feedback.subtitle")} />

      {/* Une autre séance repart d'un formulaire neuf : la frappe d'un débrief ne passe jamais
          dans un autre. */}
      <WritingSections
        key={sessionId}
        sessionId={sessionId}
        session={session}
        feedback={feedback}
      />

      <FeedbackMediaSection sessionId={sessionId} feedback={feedback} />

      {feedback == null ? null : (
        <Replies
          isSelf={isSelf}
          messages={feedback.messages}
          currentUserId={currentUserId}
          resolveMediaUrl={resolveMediaUrl}
        />
      )}
    </>
  );
}

/** Le titre du débrief, et ce qui se dit dessous : la consigne, ou la fin du suivi. */
function FeedbackHeading({ subtitle }: Readonly<{ subtitle: string }>) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      <CmvText className="font-cmv-display text-cmv-text-hi text-xl">{t("feedback.title")}</CmvText>
      <CmvText className="text-cmv-text-mid text-sm">{subtitle}</CmvText>
    </View>
  );
}

/**
 * Le débrief d'une séance dont le suivi a pris fin (#911), en lecture : ce qui a été envoyé, et les
 * réponses échangées. Ni champ, ni coche, ni ajout, ni retrait, ni barre de réponse — et la phrase
 * de fin dit pourquoi. Jamais sa propre séance : un auto-coaching n'a pas de lien à rompre.
 */
function ClosedFeedback({
  session,
  feedback,
  currentUserId,
  resolveMediaUrl,
}: Readonly<{
  session: ScheduledSessionDto;
  feedback: SessionFeedbackDto | null;
  currentUserId: string;
  resolveMediaUrl: ResolveMediaUrl;
}>) {
  const { t } = useTranslation();
  const followEndedText = useFollowEndedText();
  const ended = followEndedText(session.followEndedAt);

  return (
    <>
      <FeedbackHeading subtitle={t("feedback.followEnded", { ended })} />

      {feedback == null ? (
        <CmvText className="text-cmv-text-mid">{t("feedback.followEndedEmpty")}</CmvText>
      ) : (
        <>
          <TrackedBlockList blocks={feedback.trackedBlocks} />
          {/* `null` = débrief sans texte : légitime, un débrief peut n'être que des médias. */}
          <CmvText className="text-cmv-text-hi">
            {feedback.content ?? t("feedback.coach.mediaOnly")}
          </CmvText>
          <FeedbackMediaList media={feedback.media} resolveMediaUrl={resolveMediaUrl} />
          <FeedbackReplyMessages
            messages={feedback.messages}
            currentUserId={currentUserId}
            resolveMediaUrl={resolveMediaUrl}
          />
          <CmvText className="text-cmv-text-mid text-sm">
            {t("feedback.reply.followEnded", { ended })}
          </CmvText>
        </>
      )}
    </>
  );
}

/**
 * Le fil du coach DE CETTE SÉANCE (#599) : suivi par plusieurs coachs, l'athlète répond à celui
 * qui l'a programmée — et à personne tant que la séance ne l'a pas dit. Une séance qu'il s'est
 * programmée lui-même n'a personne à qui répondre : le fil `(soi, soi)` n'existe pas.
 */
function useSessionThread(session: ScheduledSessionDto | undefined) {
  // Rien ne s'écrira dans le fil d'une séance close : ne pas le demander — le get-or-create rendrait
  // le fil pour rien, et un 400 s'il n'a jamais existé.
  const coachId = session != null && canDebrief(session) ? session.coachId : undefined;
  const isSelf = useIsSelfAthlete()(coachId ?? "");
  const conversation = useConversationWithCoach(isSelf ? null : (coachId ?? null));
  return { isSelf, conversation };
}

/** Les réponses du coach — ou, sur une séance qu'on s'est programmée, personne à qui répondre. */
function Replies({
  isSelf,
  ...messages
}: Readonly<{ isSelf: boolean } & ComponentProps<typeof FeedbackReplyMessages>>) {
  return isSelf ? <FeedbackReplySelf /> : <FeedbackReplyMessages {...messages} />;
}

/**
 * Le décompte et le texte, ENSEMBLE : ils partent dans le même enregistrement.
 *
 * Le suivi vit en local depuis la séance ; le débrief est le moment où il franchit le réseau. Un
 * seul bouton pour les deux — deux boutons feraient croire qu'on peut envoyer l'un sans l'autre,
 * alors que le décompte accompagne le ressenti.
 *
 * Le décompte n'attend PAS la séance pour laisser écrire : si elle échoue, ou reste en pause hors
 * ligne, le texte et les médias restent accessibles, seul le rappel des coches manque — et aucun
 * décompte ne part, plutôt qu'un objet vide qui écraserait le suivi.
 */
function WritingSections({
  sessionId,
  session,
  feedback,
}: Readonly<{
  sessionId: string;
  session: ScheduledSessionDto | null;
  feedback: SessionFeedbackDto | null;
}>) {
  const blocks = useLocalBlockTracking(sessionId, session?.blocks);

  return (
    <>
      {/* Le débrief se rappelle bloc par bloc (#722), comme la séance se lit. */}
      {session != null && session.blocks.length > 0 ? (
        <FeedbackBlocksSection
          session={session}
          tracking={blocks.tracking}
          onToggle={blocks.toggle}
        />
      ) : null}
      {/* TOUJOURS à cette place, séance chargée ou non : la remonter ailleurs quand la séance
          arrive effacerait ce que l'athlète a tapé en l'attendant — réseau revenu compris. */}
      <FeedbackTextSection
        sessionId={sessionId}
        feedback={feedback}
        {...(session == null
          ? {}
          : {
              // Sans ce que le coach a retiré depuis (#311, #490, #722).
              ...feedbackTrackingInput(session, blocks.tracking),
              trackingDirty: blocks.dirty,
              onSaved: blocks.clearIfSent,
            })}
      />
    </>
  );
}
