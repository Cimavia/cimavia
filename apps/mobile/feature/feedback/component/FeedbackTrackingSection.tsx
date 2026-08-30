import {
  type ExerciseTracking,
  type ScheduledSessionExerciseDto,
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
 * Le décompte, RAPPELÉ dans le débrief.
 *
 * En lecture d'abord : l'athlète a coché pendant la séance, il vient ici pour écrire. Mais c'est
 * le dernier écran avant l'envoi, donc corriger reste à un tap — les mêmes cases que sur la
 * séance, sans changer d'écran.
 *
 * Un exercice non suivi n'affiche qu'un tiret. Jamais « 0 sur 4 » : ne pas avoir coché est un
 * choix, pas un oubli à rattraper.
 */
export function FeedbackTrackingSection({
  exercises,
  tracking,
  onToggleUnit,
  onRounds,
}: Readonly<FeedbackTrackingSectionProps>) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  // Un exercice sans unité — « étirements au ressenti » — n'a rien à décompter, donc rien à faire
  // dans un récapitulatif de décompte.
  const trackable = exercises.filter((exercise) =>
    exercise.blocks.some((block) => trackingUnits(block) != null),
  );
  if (trackable.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <CmvText className="font-cmv-display text-base text-cmv-text-hi">
          {t("feedback.tracking.title")}
        </CmvText>
        <Pressable onPress={() => setEditing((value) => !value)} hitSlop={8}>
          <CmvText className="text-cmv-accent text-sm">
            {editing ? t("feedback.tracking.done") : t("feedback.tracking.edit")}
          </CmvText>
        </Pressable>
      </View>

      {trackable.map((exercise) => (
        <View key={exercise.id} className="gap-2">
          <CmvText className="text-cmv-text-hi text-sm">{exercise.title}</CmvText>
          {editing ? (
            exercise.blocks.map((block) => (
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
          ) : (
            <TrackingRecap exercise={exercise} tracking={tracking[exercise.id] ?? null} />
          )}
        </View>
      ))}
    </View>
  );
}

function TrackingRecap({
  exercise,
  tracking,
}: Readonly<{ exercise: ScheduledSessionExerciseDto; tracking: ExerciseTracking | null }>) {
  const { t } = useTranslation();
  const summary = trackingSummary(exercise.blocks, tracking);

  if (summary.done === 0 || summary.unit == null) {
    return <CmvText className="text-cmv-text-lo text-xs">—</CmvText>;
  }

  return (
    <CmvText className="text-cmv-text-mid text-xs">
      {t(`plan.tracking.count.${summary.unit}`, { done: summary.done, total: summary.total })}
    </CmvText>
  );
}
