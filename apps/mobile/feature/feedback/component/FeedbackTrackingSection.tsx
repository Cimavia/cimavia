import {
  type ExerciseTracking,
  type ScheduledSessionExerciseDto,
  TrackingState,
  trackingSummary,
  trackingUnits,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { TrackingList } from "@/feature/plan/component/TrackingList";
import { CmvText } from "@/shared/component";

// i18n-values plan.tracking.count: TrackingUnit

type FeedbackTrackingSectionProps = {
  exercises: readonly ScheduledSessionExerciseDto[];
  tracking: Record<string, ExerciseTracking | null>;
  onToggleUnit: (exerciseId: string, blockId: string, index: number) => void;
  onRounds: (exerciseId: string, blockId: string, rounds: number) => void;
};

/**
 * Le décompte, RAPPELÉ dans le débrief — même langage que sur web.
 *
 * En lecture : l'athlète a coché pendant la séance, il vient ici pour écrire. Corriger reste à un
 * tap, exercice par exercice — les mêmes cases que sur la séance, sans changer d'écran ni déplier
 * les trois autres.
 *
 * Un exercice non suivi le DIT — « non suivi », en gris. Ni pastille, ni rouge, ni « 0 sur 4 ».
 */
export function FeedbackTrackingSection({
  exercises,
  tracking,
  onToggleUnit,
  onRounds,
}: Readonly<FeedbackTrackingSectionProps>) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);

  // Un exercice sans unité — « étirements au ressenti » — n'a rien à décompter, donc rien à faire
  // dans un récapitulatif de décompte.
  const trackable = exercises.filter((exercise) =>
    exercise.blocks.some((block) => trackingUnits(block) != null),
  );
  if (trackable.length === 0) return null;

  return (
    <View className="gap-2">
      <CmvText className="text-cmv-text-mid text-xs uppercase">
        {t("feedback.tracking.title")}
      </CmvText>

      {trackable.map((exercise) => {
        const isEditing = editing === exercise.id;
        return (
          <View
            key={exercise.id}
            className="gap-2 rounded-lg border border-cmv-border bg-cmv-surface p-3"
          >
            <Pressable
              onPress={() => setEditing(isEditing ? null : exercise.id)}
              accessibilityRole="button"
              accessibilityLabel={t("feedback.tracking.edit", { exercise: exercise.title })}
              className="flex-row items-center gap-3"
            >
              <CmvText className="flex-1 text-cmv-text-hi text-sm" numberOfLines={1}>
                {exercise.title}
              </CmvText>
              <TrackingRecap exercise={exercise} tracking={tracking[exercise.id] ?? null} />
              <CmvText className="text-cmv-accent text-xs">
                {t(isEditing ? "feedback.tracking.close" : "feedback.tracking.open")}
              </CmvText>
            </Pressable>

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
          </View>
        );
      })}

      <CmvText className="text-cmv-text-lo text-xs">{t("feedback.tracking.hint")}</CmvText>
    </View>
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
      <CmvText className="text-cmv-text-lo text-xs">{t("feedback.tracking.untracked")}</CmvText>
    );
  }

  return (
    <CmvText
      className={
        summary.state === TrackingState.DONE
          ? "text-cmv-success text-xs"
          : "text-cmv-accent text-xs"
      }
    >
      {t(`plan.tracking.count.${summary.unit}`, { done: summary.done, total: summary.total })}
    </CmvText>
  );
}
