import {
  type ExerciseTracking,
  type ScheduledSessionDto,
  ScheduledSessionStatus,
  trackingSummary,
} from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvCard } from "@/shared/component";

type AthleteSessionRailProps = {
  session: ScheduledSessionDto;
  tracking: Record<string, ExerciseTracking | null>;
  onOpenFeedback: () => void;
};

/**
 * Le rail de droite : sommaire, note du coach, et le débrief collé en bas.
 *
 * Quand il n'y a rien à sommer — une séance sans exercice —, le rail se réduit à ce qui existe
 * encore : le lien vers le coach. Un rail qui garderait ses intitulés vides ferait croire à un
 * chargement qui n'arrive jamais.
 */
export function AthleteSessionRail({
  session,
  tracking,
  onOpenFeedback,
}: Readonly<AthleteSessionRailProps>) {
  const { t } = useTranslation();
  const hasExercises = session.exercises.length > 0;

  /**
   * LE compteur de la page, et le seul. L'en-tête ne compte rien — deux compteurs finissent par
   * se contredire, et celui du rail est celui qu'on voit en défilant.
   *
   * Il n'apparaît qu'à partir d'une case cochée : « 0 sur 12 » avant d'avoir commencé serait une
   * relance, exactement ce que l'état « non suivi » interdit.
   */
  const totals = session.exercises.reduce(
    (sum, exercise) => {
      const summary = trackingSummary(exercise.blocks, tracking[exercise.id] ?? null);
      return { done: sum.done + summary.done, total: sum.total + summary.total };
    },
    { done: 0, total: 0 },
  );

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

      {totals.done === 0 ? null : (
        <CmvCard>
          <div className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-caption text-cmv-text-mid">{t("plan.athlete.progress")}</span>
            <span className="text-cmv-subtitle text-cmv-text-hi">
              {t("plan.athlete.progressCount", { done: totals.done, total: totals.total })}
            </span>
          </div>
        </CmvCard>
      )}

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
