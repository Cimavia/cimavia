import {
  type ExerciseTracking,
  type ScheduledSessionExerciseDto,
  trackingSummary,
  trackingUnits,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TrackingList } from "@/feature/plan/component/TrackingList";
import { CmvButton, CmvCard } from "@/shared/component";

type FeedbackTrackingSectionProps = {
  exercises: readonly ScheduledSessionExerciseDto[];
  tracking: Record<string, ExerciseTracking | null>;
  onToggleUnit: (exerciseId: string, blockId: string, index: number) => void;
  onRounds: (exerciseId: string, blockId: string, rounds: number) => void;
};

/**
 * Le décompte, RAPPELÉ dans le débrief.
 *
 * Il s'affiche en lecture — l'athlète a déjà coché pendant la séance, il vient ici pour écrire, pas
 * pour recocher. Mais c'est le dernier écran avant l'envoi, donc la correction doit rester à un
 * clic : « Corriger » rouvre exactement les mêmes cases que sur la séance, sans changer de page.
 *
 * Un exercice non suivi n'affiche RIEN de plus qu'un tiret : pas de « 0 sur 4 », pas de rouge. Ne
 * pas avoir coché est un choix, pas un oubli à rattraper.
 */
export function FeedbackTrackingSection({
  exercises,
  tracking,
  onToggleUnit,
  onRounds,
}: Readonly<FeedbackTrackingSectionProps>) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  // Seuls les exercices qui ont quelque chose à décompter : un exercice libre n'a pas d'unité, il
  // n'a donc pas sa place dans un récapitulatif de décompte.
  const trackable = exercises.filter((exercise) =>
    exercise.blocks.some((block) => trackingUnits(block) != null),
  );
  if (trackable.length === 0) return null;

  return (
    <CmvCard>
      <div className="flex flex-col gap-cmv-md">
        <div className="flex items-center justify-between gap-cmv-md">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("feedback.tracking.title")}</h2>
          <CmvButton variant="ghost" onClick={() => setEditing((value) => !value)}>
            {editing ? t("feedback.tracking.done") : t("feedback.tracking.edit")}
          </CmvButton>
        </div>

        <ul className="flex flex-col gap-cmv-md">
          {trackable.map((exercise) => (
            <li key={exercise.id} className="flex flex-col gap-cmv-xs">
              <span className="text-cmv-body text-cmv-text-hi">{exercise.title}</span>
              {editing ? (
                <div className="flex flex-col gap-cmv-sm">
                  {exercise.blocks.map((block) => (
                    <TrackingList
                      key={block.id}
                      block={block}
                      customMetrics={exercise.customMetrics}
                      state={tracking[exercise.id]?.[block.id]}
                      onToggle={(index) => onToggleUnit(exercise.id, block.id, index)}
                      onRounds={(rounds) => onRounds(exercise.id, block.id, rounds)}
                      frozen={false}
                    />
                  ))}
                </div>
              ) : (
                <TrackingRecap exercise={exercise} tracking={tracking[exercise.id] ?? null} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </CmvCard>
  );
}

function TrackingRecap({
  exercise,
  tracking,
}: Readonly<{ exercise: ScheduledSessionExerciseDto; tracking: ExerciseTracking | null }>) {
  const { t } = useTranslation();
  const summary = trackingSummary(exercise.blocks, tracking);

  if (summary.done === 0 || summary.unit == null) {
    return <span className="text-cmv-caption text-cmv-text-lo">—</span>;
  }

  return (
    <span className="text-cmv-caption text-cmv-text-mid">
      {t(`plan.tracking.count.${summary.unit}`, { done: summary.done, total: summary.total })}
    </span>
  );
}
