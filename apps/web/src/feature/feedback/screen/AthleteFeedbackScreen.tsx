import type {
  BlockSessionTracking,
  FeedbackBlockTracking,
  ScheduledSessionDto,
  SessionFeedbackDto,
} from "@cmv/shared";
import {
  draftAfterLoad,
  FEEDBACK_CONTENT_MAX_LENGTH,
  feedbackTrackingInput,
  myFeedbackKeys,
} from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FeedbackBlocksSection } from "@/feature/feedback/component/FeedbackBlocksSection";
import { FeedbackMediaSection } from "@/feature/feedback/component/FeedbackMediaSection";
import { FeedbackReplyThread } from "@/feature/feedback/component/FeedbackReplyThread";
import { useMyFeedback, useUpsertMyFeedback } from "@/feature/feedback/hook/useMyFeedback";
import { useConversationWithCoach } from "@/feature/message/hook/useMessages";
import { useLocalBlockTracking } from "@/feature/plan/hook/useLocalBlockTracking";
import { useMyScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { AppShell } from "@/feature/shell";
import { CmvButton, CmvCard, CmvErrorState, CmvTextArea } from "@/shared/component";
import { useIsSelfAthlete } from "@/shared/hook/useAthleteLabel";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { apiErrorMessage } from "@/shared/lib/api";

const route = getRouteApi("/sessions/$sessionId/feedback");

/**
 * Le débrief d'une séance, côté athlète sur web (#26) : un champ texte libre + des médias, qu'on
 * peut reprendre plus tard.
 *
 * Écrire exige le réseau (pas d'écriture différée en MVP) : contrairement à la lecture de la
 * séance, on ne prétend pas fonctionner hors-ligne. L'échec est dit, pas masqué.
 *
 * Texte et médias ont chacun leurs mutations et leurs erreurs, qui ne se croisent jamais — un
 * upload qui échoue ne doit pas laisser croire que le texte n'est pas enregistré.
 */
export function AthleteFeedbackScreen() {
  const { t } = useTranslation();
  const { sessionId } = route.useParams();
  const { from } = route.useSearch();
  const session = useMyScheduledSession(sessionId);
  const { data: feedback, isPending, isError, refetch } = useMyFeedback(sessionId);

  return (
    <AppShell
      title={t("feedback.title")}
      subtitle={session.data?.title ?? t("feedback.subtitle")}
      // Retour vers LA SÉANCE et non le planning : le débrief est son enfant, et c'est de là
      // qu'on vient. La semaine du planning suit (#251) — sans elle, « Mon planning » oublierait
      // d'où l'athlète est parti dès qu'il est passé par le débrief.
      back={{
        label: t("feedback.backToSession"),
        link: { to: "/sessions/$sessionId", params: { sessionId }, search: { from } },
      }}
    >
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {/* Une autre séance repart d'un formulaire neuf : la frappe d'un débrief ne passe jamais
          dans un autre, même quand la route garde l'écran monté. */}
      {isPending || isError ? null : (
        <FeedbackBody
          key={sessionId}
          sessionId={sessionId}
          session={session.data ?? null}
          feedback={feedback ?? null}
        />
      )}
    </AppShell>
  );
}

/**
 * Le décompte, le texte et les médias — et UN seul envoi.
 *
 * Le décompte vit en local depuis la séance (`useLocalBlockTracking`) ; le débrief est le moment où il
 * franchit le réseau, avec le texte. Un seul bouton pour les deux : deux boutons feraient croire
 * qu'on peut envoyer l'un sans l'autre, alors que le décompte ACCOMPAGNE le ressenti.
 *
 * La séance peut manquer (requête lente ou en erreur) sans rien bloquer : on perd le rappel des
 * coches, pas la possibilité d'écrire. Aucun décompte n'est alors envoyé — mieux vaut ne rien dire
 * que d'écraser le suivi avec un objet vide.
 */
function FeedbackBody({
  sessionId,
  session,
  feedback,
}: Readonly<{
  sessionId: string;
  session: ScheduledSessionDto | null;
  feedback: SessionFeedbackDto | null;
}>) {
  const { t } = useTranslation();
  const tracking = useFeedbackTracking(sessionId, session);
  const upsert = useUpsertMyFeedback(sessionId, tracking.onSaved);
  const [content, setContent] = useState("");

  /**
   * Le formulaire part de ce qui est déjà enregistré (un débrief se complète en plusieurs fois).
   * On n'examine le champ QUE quand l'identité du débrief chargé change : réécrire à chaque render
   * effacerait la frappe en cours dès qu'une requête d'arrière-plan se termine. Et l'examen ne
   * réécrit pas une frappe : cette identité naît au premier média joint, texte en cours (#284).
   *
   * Ajusté PENDANT le render et non dans un effet : c'est de l'état dérivé d'une donnée chargée
   * (même raisonnement que côté mobile).
   */
  const [synced, setSynced] = useState<SessionFeedbackDto | null>(null);
  if ((feedback?.id ?? null) !== (synced?.id ?? null)) {
    setSynced(feedback);
    setContent(draftAfterLoad(content, synced?.content ?? null, feedback?.content ?? null));
  }

  // Un PREMIER débrief vide reste légitime — « j'ai fait la séance, rien à dire » est une réponse,
  // et forcer du texte n'en produit que de creux. Ré-enregistrer un débrief inchangé, non.
  const canSubmit = feedback == null || content !== (feedback.content ?? "") || tracking.dirty;

  return (
    <div className="flex flex-col gap-cmv-lg">
      <div className="grid w-full gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-cmv-lg">
          {tracking.section}

          <CmvCard>
            <div className="flex flex-col gap-cmv-md">
              <CmvTextArea
                label={t("feedback.contentLabel")}
                name="feedback-content"
                placeholder={t("feedback.contentPlaceholder")}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
                rows={6}
              />
              <p className="text-cmv-caption text-cmv-text-lo">{t("feedback.contentHint")}</p>
            </div>
          </CmvCard>

          <FeedbackMediaSection sessionId={sessionId} feedback={feedback ?? null} />

          {/* La conversation avec le coach, LÀ OÙ ELLE A COMMENCÉ. Rien tant que le débrief
              n'existe pas : on ne répond pas à ce qu'on n'a pas encore écrit. */}
          {feedback == null ? null : (
            <FeedbackReplyDiscussion
              sessionId={sessionId}
              coachId={session?.coachId ?? null}
              feedback={feedback}
            />
          )}
        </div>

        <FeedbackSubmitRail
          hasContent={content.length > 0}
          hasMedia={(feedback?.media.length ?? 0) > 0}
          hasTracking={tracking.hasAny}
          canSubmit={canSubmit}
          isPending={upsert.isPending}
          error={upsert.isError ? (apiErrorMessage(upsert.error) ?? t("feedback.saveError")) : null}
          saved={upsert.isSuccess && !canSubmit}
          onSubmit={() =>
            upsert.mutate({ content: content.length === 0 ? null : content, ...tracking.payload() })
          }
        />
      </div>
    </div>
  );
}

/**
 * Le décompte du débrief, bloc par bloc (#722) : ce qu'il rappelle, ce qu'il envoie, et ce qu'il
 * efface une fois parti.
 *
 * Le suivi part filtré sur ce que la séance porte encore : une coche restée en local sur un bloc
 * retiré par le coach ferait refuser tout le débrief (#311).
 */
function useFeedbackTracking(sessionId: string, session: ScheduledSessionDto | null) {
  const blocks = useLocalBlockTracking(sessionId, session?.blocks);

  return {
    section:
      session == null || session.blocks.length === 0 ? null : (
        <FeedbackBlocksSection
          session={session}
          tracking={blocks.tracking}
          onToggle={blocks.toggle}
        />
      ),
    dirty: blocks.dirty,
    hasAny: hasAnyBlockTracking(blocks.tracking),
    /** Sans séance, aucun décompte ne part : mieux vaut ne rien dire qu'écraser le suivi. */
    payload: () => (session == null ? {} : feedbackTrackingInput(session, blocks.tracking)),
    // Le local est effacé une fois le décompte accepté par le serveur : il a fait son travail, et
    // le garder ferait diverger les deux copies au prochain chargement. Sauf s'il a bougé pendant
    // l'envoi (#499) : ce qui a changé entre-temps reste à envoyer.
    onSaved: (sentBlocks: FeedbackBlockTracking | undefined) => blocks.clearIfSent(sentBlocks),
  };
}

/** Au moins une case cochée quelque part — ce qui distingue « rien envoyé » de « rien coché ». */
function hasAnyBlockTracking(tracking: BlockSessionTracking): boolean {
  return Object.values(tracking).some((block) => block != null && block.checked.length > 0);
}

/**
 * Le rail d'envoi : ce qui va partir, puis le bouton pour le faire.
 *
 * La phrase est là pour qu'un débrief vide ne parte pas par accident — mais elle n'EMPÊCHE rien :
 * « séance faite, aucun commentaire, aucun décompte » est une réponse valable, et le bouton reste
 * actif pour la dire.
 */
function FeedbackSubmitRail({
  hasContent,
  hasMedia,
  hasTracking,
  canSubmit,
  isPending,
  error,
  saved,
  onSubmit,
}: Readonly<{
  hasContent: boolean;
  hasMedia: boolean;
  hasTracking: boolean;
  canSubmit: boolean;
  isPending: boolean;
  error: string | null;
  saved: boolean;
  onSubmit: () => void;
}>) {
  const { t } = useTranslation();
  const empty = !hasContent && !hasMedia && !hasTracking;

  return (
    <aside className="flex min-w-0 flex-col gap-cmv-md xl:sticky xl:top-32 xl:self-start">
      <CmvCard>
        <div className="flex flex-col gap-cmv-md">
          <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
            {t("feedback.submit.title")}
          </h2>
          <p className="text-cmv-body text-cmv-text-mid">
            {t(empty ? "feedback.submit.empty" : "feedback.submit.filled")}
          </p>

          <CmvButton disabled={isPending || !canSubmit} onClick={onSubmit}>
            {isPending ? t("feedback.saving") : t("feedback.submit.action")}
          </CmvButton>

          {error == null ? null : <span className="text-cmv-body text-cmv-error-on">{error}</span>}
          {saved ? (
            <span className="text-cmv-body text-cmv-accent">{t("feedback.saved")}</span>
          ) : null}
        </div>
      </CmvCard>
    </aside>
  );
}

/**
 * Ce que le coach a répondu sur CE débrief, et de quoi lui répondre à son tour.
 *
 * L'athlète peut répondre à la réponse (tranché en #190) : s'en priver fabriquerait un aller
 * simple là où la messagerie fait l'aller-retour.
 *
 * ⚠️ **Lire ici ne marque RIEN comme lu.** `markRead` est par FIL, pas par message : l'appeler
 * depuis le débrief éteindrait le compteur de toute la messagerie, y compris pour des messages que
 * l'athlète n'a jamais vus. Le badge reste donc allumé jusqu'à l'ouverture du fil — conséquence
 * voulue, et cohérente avec « la marque de lecture du participant reste le seul marqueur » (#611).
 *
 * Le fil est celui du coach DE LA SÉANCE (#599) : un athlète suivi par plusieurs coachs répond à
 * celui qui a programmé ce qu'il débriefe, pas à un coach choisi au hasard. `null` tant que la
 * séance n'est pas lue — rien ne s'ouvre.
 */
function FeedbackReplyDiscussion({
  sessionId,
  coachId,
  feedback,
}: Readonly<{ sessionId: string; coachId: string | null; feedback: SessionFeedbackDto }>) {
  const queryClient = useQueryClient();
  // Une séance qu'il s'est programmée lui-même n'a personne à qui répondre : le fil `(soi, soi)`
  // n'existe pas, l'API refuserait de l'ouvrir.
  const isSelf = useIsSelfAthlete()(coachId ?? "");
  const conversation = useConversationWithCoach(isSelf ? null : coachId);
  const freshMediaUrl = useFreshMediaUrl(myFeedbackKeys.detail(sessionId));

  return (
    <FeedbackReplyThread
      feedbackId={feedback.id}
      messages={feedback.messages}
      conversationId={conversation.data?.id}
      isThreadError={conversation.isError}
      isSelf={isSelf}
      // Son PROPRE débrief, pas la boîte du coach : c'est là que la réponse doit réapparaître.
      onSent={() => queryClient.invalidateQueries({ queryKey: myFeedbackKeys.detail(sessionId) })}
      resolveMediaUrl={freshMediaUrl}
    />
  );
}
