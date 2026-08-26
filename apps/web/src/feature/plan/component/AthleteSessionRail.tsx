import { type ScheduledSessionDto, ScheduledSessionStatus } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvCard } from "@/shared/component";

type AthleteSessionRailProps = {
  session: ScheduledSessionDto;
  onOpenFeedback: () => void;
};

/**
 * Le rail de droite : sommaire, note du coach, et le débrief collé en bas.
 *
 * Quand il n'y a rien à sommer — une séance sans exercice —, le rail se réduit à ce qui existe
 * encore : le lien vers le coach. Un rail qui garderait ses intitulés vides ferait croire à un
 * chargement qui n'arrive jamais.
 */
export function AthleteSessionRail({ session, onOpenFeedback }: Readonly<AthleteSessionRailProps>) {
  const { t } = useTranslation();
  const hasExercises = session.exercises.length > 0;

  return (
    // `sticky` : le sommaire suit le défilement, c'est toute sa raison d'être.
    <aside className="flex min-w-0 flex-col gap-cmv-md xl:sticky xl:top-32 xl:self-start">
      {hasExercises ? (
        <CmvCard>
          <nav className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-caption text-cmv-text-mid">{t("plan.athlete.summary")}</span>
            {session.exercises.map((exercise, index) => (
              <a
                key={exercise.id}
                href={`#exercise-${exercise.id}`}
                className="truncate text-cmv-body text-cmv-text-mid hover:text-cmv-text-hi"
              >
                {index + 1}. {exercise.title}
              </a>
            ))}
          </nav>
        </CmvCard>
      ) : null}

      {session.notes == null ? null : (
        <CmvCard>
          <div className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-caption text-cmv-text-mid">{t("plan.athlete.notes")}</span>
            <p className="text-cmv-body text-cmv-text-hi">{session.notes}</p>
          </div>
        </CmvCard>
      )}

      <Link to="/my-coach" className="text-cmv-caption text-cmv-accent hover:underline">
        {t("plan.athlete.contactCoach")}
      </Link>

      {/* RETIRÉ — pas grisé — sur une séance vide : un bouton mort se tape quand même, et
          l'anomalie est celle du coach, pas de l'athlète. */}
      {hasExercises ? (
        <CmvButton onClick={onOpenFeedback}>
          {/* Le libellé dit si le débrief existe DÉJÀ : « débriefer » sur une séance débriefée
              laisserait croire qu'on écrase. */}
          {session.status === ScheduledSessionStatus.DONE
            ? t("feedback.openDone")
            : t("feedback.open")}
        </CmvButton>
      ) : null}
    </aside>
  );
}
