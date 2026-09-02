import { type CoachFeedbackSummaryDto, MediaType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { FeedbackReplyThread } from "@/feature/feedback/component/FeedbackReplyThread";
import { TrackedExerciseList } from "@/feature/feedback/component/TrackedExerciseList";
import { useSessionFeedback } from "@/feature/feedback/hook/useFeedbacks";
import { CmvAvatar, CmvButton } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
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
const SECTION_TITLE = "text-cmv-caption text-cmv-accent uppercase tracking-wide";

export function FeedbackReadingPane({ feedback, onOpenSheet }: Readonly<FeedbackReadingPaneProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const { data: detail, isPending } = useSessionFeedback(feedback.scheduledSessionId);

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
        <TrackedExerciseList exercises={detail?.trackedExercises ?? []} />

        <section className="flex flex-col gap-cmv-sm">
          <h4 className={SECTION_TITLE}>
            {t("feedback.detail.media", { count: feedback.mediaCount })}
          </h4>

          {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

          <div className="grid gap-cmv-sm sm:grid-cols-2">
            {(detail?.media ?? []).map((media) => {
              if (media.type === MediaType.IMAGE) {
                return (
                  <a
                    key={media.id}
                    href={media.url}
                    target="_blank"
                    rel="noreferrer"
                    title={t("feedback.detail.openFull")}
                  >
                    {/* `contain`, pas `cover` : le coach regarde un GESTE — un recadrage rognerait
                        justement ce qu'il doit voir. Le clic ouvre la photo en pleine taille. */}
                    <img
                      src={media.url}
                      alt={media.fileName}
                      className="h-48 w-full rounded-cmv-md border border-cmv-border bg-cmv-bg-1 object-contain"
                    />
                  </a>
                );
              }
              if (media.type === MediaType.AUDIO) {
                // Note vocale (débrief vocal, P5) : lecteur audio plein largeur, pas de « boîte
                // noire » vidéo.
                return (
                  <audio
                    key={media.id}
                    src={media.url}
                    controls
                    className="w-full rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-sm sm:col-span-2"
                  >
                    <track kind="captions" />
                  </audio>
                );
              }
              // Vidéo : le navigateur streame depuis l'URL signée : rien ne transite par l'API.
              return (
                <video
                  key={media.id}
                  src={media.url}
                  controls
                  className="h-48 w-full rounded-cmv-md border border-cmv-border bg-cmv-bg-1"
                >
                  <track kind="captions" />
                </video>
              );
            })}
          </div>
        </section>

        {/* Sous les médias : on répond APRÈS avoir tout lu, dans l'ordre où le débrief se parcourt.
            `messages` vient du détail — le résumé de la liste ne les porte pas. */}
        <FeedbackReplyThread feedback={feedback} messages={detail?.messages ?? []} />
      </div>
    </div>
  );
}
