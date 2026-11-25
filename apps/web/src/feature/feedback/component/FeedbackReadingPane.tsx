import {
  type CoachFeedbackSummaryDto,
  coachFeedbackKeys,
  isEndedLink,
  MediaType,
  nextVoiceNoteInFeedback,
} from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { FeedbackReplyThread } from "@/feature/feedback/component/FeedbackReplyThread";
import { TrackedBlockList } from "@/feature/feedback/component/TrackedBlockList";
import { useSessionFeedback } from "@/feature/feedback/hook/useFeedbacks";
import { useConversationWith } from "@/feature/message/hook/useMessages";
import { CmvAvatar, CmvButton, CmvMediaPlayer } from "@/shared/component";
import { useAthleteLabel, useIsSelfAthlete } from "@/shared/hook/useAthleteLabel";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { useVoiceNoteChain } from "@/shared/hook/useVoiceNoteChain";
import { formatDate } from "@/shared/util/date.util";

type FeedbackReadingPaneProps = {
  feedback: CoachFeedbackSummaryDto;
  onOpenSheet: () => void;
};

/**
 * Le volet de lecture de la boîte de réception : le débrief ouvert, en entier.
 *
 * C'était un tiroir (`CmvPanel`) posé par-dessus une liste de cartes. La maquette en fait la
 * moitié droite d'un écran fixe — ce qui n'est pas un changement d'habillage : un tiroir se ferme
 * pour revenir à la liste, un volet la laisse visible, et c'est ce qui rend le passage d'un
 * débrief au suivant un seul clic. Il n'y a donc plus de bouton « Fermer » : on change de débrief,
 * on n'en sort pas.
 *
 * Les URLs de médias sont signées à durée courte et régénérées à chaque lecture : le volet
 * recharge donc le détail plutôt que de réutiliser celles de la liste (qui n'en porte d'ailleurs
 * pas — elle ne compte que les médias).
 */
/**
 * Les intertitres du débrief, en ACCENT : le volet empile trois sections de même poids
 * typographique, et un gris de plus les faisait disparaître dans le texte qu'elles annoncent.
 */
const SECTION_TITLE = "text-cmv-caption text-cmv-accent-on uppercase tracking-wide";

export function FeedbackReadingPane({ feedback, onOpenSheet }: Readonly<FeedbackReadingPaneProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const { data: detail, isPending } = useSessionFeedback(feedback.scheduledSessionId);
  const freshMediaUrl = useFreshMediaUrl(coachFeedbackKeys.bySession(feedback.scheduledSessionId));
  const isSelf = useIsSelfAthlete()(feedback.athleteId);
  // Get-or-create, idempotent et stable : ouvrir un débrief ne crée pas un fil de plus.
  // `null` sur son PROPRE débrief : le `enabled` du hook coupe la requête, qui prendrait un 409
  // (#198) affiché en « réessaie dans un instant » — une panne passagère qui n'en est pas une.
  //
  // `null` aussi sur un suivi terminé (#910), et tant qu'on ne sait pas s'il l'est : le fil ne
  // s'écrit plus, et s'il n'existe pas, le get-or-create refuserait de l'ouvrir — encore une fausse
  // panne passagère.
  const closed = useClosedReply(feedback.athleteId);
  const conversation = useConversationWith(
    isSelf || !closed.isKnown || closed.note != null ? null : feedback.athleteId,
  );
  const queryClient = useQueryClient();
  // La liste ENTIÈRE et pas seulement ce débrief : `firstReply` y vit aussi, et c'est lui qui pose
  // le badge « répondu » sur la ligne qu'on vient de traiter.
  const refreshFeedbacks = () => queryClient.invalidateQueries({ queryKey: coachFeedbackKeys.all });
  // Les notes du débrief s'enchaînent entre elles, jamais vers ses réponses (#529).
  const media = detail?.media ?? [];
  const chain = useVoiceNoteChain((id) => nextVoiceNoteInFeedback(media, id));

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-cmv-md border-cmv-border border-b px-cmv-lg py-cmv-md">
        <CmvAvatar name={feedback.athleteName} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-cmv-subtitle text-cmv-text-hi">
            {athleteLabel(feedback.athleteId, feedback.athleteName)}
          </h2>
          <p className="truncate text-cmv-caption text-cmv-text-mid">
            {feedback.sessionTitle} · {formatDate(feedback.scheduledDate)}
          </p>
        </div>

        {/* Le débrief dit ce qu'un athlète a ressenti d'UNE séance ; sa fiche dit qui il est.
            La fiche s'ouvre PAR-DESSUS la boîte de réception, elle n'y renvoie pas : envoyer le
            coach au tableau de bord lui ferait perdre son tri en cours — sa recherche, son segment,
            le débrief ouvert — pour consulter deux lignes de note. */}
        <CmvButton variant="secondary" onClick={onOpenSheet}>
          {t("feedback.detail.openSheet")}
        </CmvButton>
      </header>

      <div className="flex flex-1 flex-col gap-cmv-lg overflow-y-auto p-cmv-lg">
        <section className="flex flex-col gap-cmv-xs">
          <h4 className={SECTION_TITLE}>{t("feedback.detail.content")}</h4>
          {/* Un débrief peut n'être que des médias : pas de texte inventé (règle nullable). */}
          <p className="whitespace-pre-wrap text-cmv-text-hi">{feedback.content ?? "—"}</p>
        </section>

        {/* Le décompte ACCOMPAGNE le ressenti : il se lit juste après le texte, avant les médias,
            dans l'ordre où l'athlète l'a envoyé. */}
        <TrackedBlockList blocks={detail?.trackedBlocks ?? []} />

        <section className="flex flex-col gap-cmv-sm">
          <h4 className={SECTION_TITLE}>
            {t("feedback.detail.media", { count: feedback.mediaCount })}
          </h4>

          {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

          <div className="grid gap-cmv-sm sm:grid-cols-2">
            {media.map((item) => {
              if (item.type === MediaType.IMAGE) {
                return (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    title={t("feedback.detail.openFull")}
                  >
                    {/* `contain`, pas `cover` : le coach regarde un GESTE — un recadrage rognerait
                        justement ce qu'il doit voir. Le clic ouvre la photo en pleine taille. */}
                    <img
                      src={item.url}
                      alt={item.fileName}
                      className="h-48 w-full rounded-cmv-md border border-cmv-border bg-cmv-bg-1 object-contain"
                    />
                  </a>
                );
              }
              if (item.type === MediaType.AUDIO) {
                // Note vocale (débrief vocal, P5) : lecteur audio plein largeur, pas de « boîte
                // noire » vidéo.
                return (
                  <div key={item.id} className="sm:col-span-2">
                    <CmvMediaPlayer
                      kind="audio"
                      url={item.url}
                      resolveUrl={() => freshMediaUrl(item.id)}
                      className="w-full rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-sm"
                      cue={chain.cueOf(item.id)}
                    />
                  </div>
                );
              }
              // Vidéo : le navigateur streame depuis l'URL signée : rien ne transite par l'API.
              return (
                <div key={item.id}>
                  <CmvMediaPlayer
                    kind="video"
                    url={item.url}
                    resolveUrl={() => freshMediaUrl(item.id)}
                    className="h-48 w-full rounded-cmv-md border border-cmv-border bg-cmv-bg-1"
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Sous les médias : on répond APRÈS avoir tout lu, dans l'ordre où le débrief se parcourt.
            `messages` vient du détail — le résumé de la liste ne les porte pas. */}
        <FeedbackReplyThread
          feedbackId={feedback.id}
          messages={detail?.messages ?? []}
          conversationId={conversation.data?.id}
          isThreadError={conversation.isError}
          isSelf={isSelf}
          closedNote={closed.note}
          onSent={refreshFeedbacks}
          resolveMediaUrl={freshMediaUrl}
        />
      </div>
    </div>
  );
}

/**
 * Le suivi de CE Coach avec l'athlète a-t-il pris fin (#910) ? `note` est ce que le fil de réponse
 * dit alors à la place du composeur, `null` sinon. `isKnown` reste faux tant que ses liens se
 * chargent : le composeur se montre, fermé, sans fil demandé. Illisibles, ils ne tranchent plus
 * rien : le fil se demande comme avant #910, et l'API refuse en 409 l'envoi d'un suivi terminé —
 * mieux qu'un composeur éteint sans raison ni relance. C'est son lien qui compte, pas le
 * cycle : un débrief d'un cycle partagé (#610) se répond par le fil de chaque Coach avec l'athlète.
 */
function useClosedReply(athleteId: string): { isKnown: boolean; note: string | null } {
  const { t } = useTranslation();
  const { data: links, isError } = useAthletes();
  const followEndedText = useFollowEndedText();
  if (links == null) return { isKnown: isError, note: null };
  const link = links.find((candidate) => candidate.athleteId === athleteId);
  if (link == null || !isEndedLink(link)) return { isKnown: true, note: null };
  return {
    isKnown: true,
    note: t("feedback.reply.followEnded", { ended: followEndedText(link.endedAt) }),
  };
}
