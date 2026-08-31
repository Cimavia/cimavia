import { type TrackedExerciseDto, TrackingState } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvText } from "@/shared/component";

// i18n-values plan.tracking.count: TrackingUnit

/**
 * Le décompte tel que le COACH le lit : en lecture, sans jugement.
 *
 * Un exercice sans suivi le dit — « pas de décompte », en gris. Le terme nomme ce qui MANQUE,
 * pas ce que l'athlète aurait omis : ni pastille, ni rouge, ni « 0 sur 4 ». Ne rien cocher ne veut
 * pas dire ne rien faire, et un coach qui verrait du rouge lirait un reproche là où il n'y a
 * qu'une absence.
 */
export function TrackedExerciseList({
  exercises,
}: Readonly<{ exercises: readonly TrackedExerciseDto[] }>) {
  const { t } = useTranslation();
  const trackable = exercises.filter((exercise) => exercise.unit != null);
  if (trackable.length === 0) return null;

  return (
    <View className="gap-2">
      <CmvText className="text-cmv-accent text-xs uppercase">
        {t("feedback.detail.tracking")}
      </CmvText>

      {trackable.map((exercise) => (
        <View key={exercise.exerciseId} className="flex-row items-center gap-3">
          <CmvText className="flex-1 text-cmv-text-hi text-sm" numberOfLines={1}>
            {exercise.title}
          </CmvText>
          <TrackedValue exercise={exercise} />
        </View>
      ))}
    </View>
  );
}

function TrackedValue({ exercise }: Readonly<{ exercise: TrackedExerciseDto }>) {
  const { t } = useTranslation();

  if (exercise.state === TrackingState.UNTRACKED || exercise.unit == null) {
    return (
      <CmvText className="text-cmv-text-lo text-xs">{t("feedback.tracking.untracked")}</CmvText>
    );
  }

  return (
    <CmvText
      className={
        exercise.state === TrackingState.DONE
          ? "text-cmv-success text-xs"
          : "text-cmv-accent text-xs"
      }
    >
      {t(`plan.tracking.count.${exercise.unit}`, { done: exercise.done, total: exercise.total })}
    </CmvText>
  );
}
