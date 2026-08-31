import { type TrackedExerciseDto, TrackingState } from "@cmv/shared";
import { useTranslation } from "react-i18next";

// i18n-values plan.tracking.count: TrackingUnit

/**
 * Le décompte tel que le COACH le lit : en lecture, sans jugement.
 *
 * Un exercice sans suivi le dit — « pas de décompte », en gris. Le terme nomme ce qui MANQUE,
 * pas ce que l'athlète aurait omis : ni pastille, ni rouge, ni « 0 sur 4 ». Ne rien cocher ne veut
 * pas dire ne rien faire, et un coach qui verrait du rouge lirait un reproche là où il n'y a
 * qu'une absence.
 *
 * Rien du tout quand aucun exercice n'a d'unité cochable : un récapitulatif vide n'apprend rien.
 */
export function TrackedExerciseList({
  exercises,
}: Readonly<{ exercises: readonly TrackedExerciseDto[] }>) {
  const { t } = useTranslation();
  const trackable = exercises.filter((exercise) => exercise.unit != null);
  if (trackable.length === 0) return null;

  return (
    <section className="flex flex-col gap-cmv-xs">
      <h4 className="text-cmv-caption text-cmv-accent uppercase tracking-wide">
        {t("feedback.detail.tracking")}
      </h4>
      <ul className="flex flex-col gap-cmv-xs">
        {trackable.map((exercise) => (
          <li key={exercise.exerciseId} className="flex items-center gap-cmv-md">
            <span className="min-w-0 flex-1 truncate text-cmv-body text-cmv-text-hi">
              {exercise.title}
            </span>
            <TrackedValue exercise={exercise} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrackedValue({ exercise }: Readonly<{ exercise: TrackedExerciseDto }>) {
  const { t } = useTranslation();

  if (exercise.state === TrackingState.UNTRACKED || exercise.unit == null) {
    return (
      <span className="shrink-0 text-cmv-caption text-cmv-text-lo">
        {t("feedback.tracking.untracked")}
      </span>
    );
  }

  return (
    <span
      className={
        exercise.state === TrackingState.DONE
          ? "shrink-0 text-cmv-caption text-cmv-success"
          : "shrink-0 text-cmv-caption text-cmv-accent"
      }
    >
      {t(`plan.tracking.count.${exercise.unit}`, {
        done: exercise.done,
        total: exercise.total,
      })}
    </span>
  );
}
