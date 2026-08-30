import {
  type ExerciseTracking,
  type ScheduledSessionExerciseDto,
  TrackingState,
  trackingSummary,
  trackingUnits,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TrackingList } from "@/feature/plan/component/TrackingList";
import { CmvCard } from "@/shared/component";

// i18n-values plan.tracking.count: TrackingUnit

type FeedbackTrackingSectionProps = {
  exercises: readonly ScheduledSessionExerciseDto[];
  tracking: Record<string, ExerciseTracking | null>;
  onToggleUnit: (exerciseId: string, blockId: string, index: number) => void;
  onRounds: (exerciseId: string, blockId: string, rounds: number) => void;
};

/**
 * Le décompte, RAPPELÉ dans le débrief.
 *
 * En lecture — l'athlète a coché pendant la séance, il vient ici pour écrire. Mais c'est le dernier
 * écran avant l'envoi, donc corriger reste à UN clic, exercice par exercice : le crayon rouvre les
 * mêmes cases que sur la séance, sans changer de page ni déplier les trois autres.
 *
 * Un exercice non suivi le DIT — « non suivi », en gris. Ni pastille, ni rouge, ni « 0 sur 4 » :
 * ne rien cocher ne veut pas dire ne rien faire.
 */
export function FeedbackTrackingSection({
  exercises,
  tracking,
  onToggleUnit,
  onRounds,
}: Readonly<FeedbackTrackingSectionProps>) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);

  // Seuls les exercices qui ont quelque chose à décompter : un exercice libre sans ligne n'a pas
  // d'unité, il n'a donc pas sa place dans un récapitulatif de décompte.
  const trackable = exercises.filter((exercise) =>
    exercise.blocks.some((block) => trackingUnits(block) != null),
  );
  if (trackable.length === 0) return null;

  return (
    <section className="flex flex-col gap-cmv-sm">
      <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
        {t("feedback.tracking.title")}
      </h2>

      {trackable.map((exercise) => {
        const isEditing = editing === exercise.id;
        return (
          <CmvCard key={exercise.id}>
            <div className="flex flex-col gap-cmv-sm">
              <div className="flex items-center gap-cmv-md">
                <span className="min-w-0 flex-1 truncate text-cmv-body text-cmv-text-hi">
                  {exercise.title}
                </span>
                <TrackingRecap exercise={exercise} tracking={tracking[exercise.id] ?? null} />
                <button
                  type="button"
                  aria-label={t("feedback.tracking.edit", { exercise: exercise.title })}
                  aria-expanded={isEditing}
                  onClick={() => setEditing(isEditing ? null : exercise.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-cmv-md border border-cmv-border bg-cmv-bg-1 text-cmv-text-mid hover:border-cmv-border-hi hover:text-cmv-text-hi"
                >
                  <PencilIcon />
                </button>
              </div>

              {isEditing
                ? exercise.blocks.map((block) => (
                    <TrackingList
                      key={block.id}
                      block={block}
                      customMetrics={exercise.customMetrics}
                      state={tracking[exercise.id]?.[block.id]}
                      onToggle={(index) => onToggleUnit(exercise.id, block.id, index)}
                      onRounds={(rounds) => onRounds(exercise.id, block.id, rounds)}
                      frozen={false}
                    />
                  ))
                : null}
            </div>
          </CmvCard>
        );
      })}

      <p className="text-cmv-caption text-cmv-text-lo">{t("feedback.tracking.hint")}</p>
    </section>
  );
}

function TrackingRecap({
  exercise,
  tracking,
}: Readonly<{ exercise: ScheduledSessionExerciseDto; tracking: ExerciseTracking | null }>) {
  const { t } = useTranslation();
  const summary = trackingSummary(exercise.blocks, tracking);

  if (summary.state === TrackingState.UNTRACKED || summary.unit == null) {
    return (
      <span className="shrink-0 text-cmv-caption text-cmv-text-lo">
        {t("feedback.tracking.untracked")}
      </span>
    );
  }

  return (
    <span
      className={
        summary.state === TrackingState.DONE
          ? "shrink-0 text-cmv-caption text-cmv-success"
          : "shrink-0 text-cmv-caption text-cmv-accent"
      }
    >
      {t(`plan.tracking.count.${summary.unit}`, { done: summary.done, total: summary.total })}
    </span>
  );
}

/** Le crayon du bouton « corriger ». Inline : une icône de plus ne vaut pas une dépendance. */
function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h4l10-10a2.8 2.8 0 10-4-4L4 16v4z" />
    </svg>
  );
}
