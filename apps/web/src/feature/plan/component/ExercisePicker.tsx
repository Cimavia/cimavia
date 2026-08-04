import type { ExerciseDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge } from "@/shared/component";

type ExercisePickerProps = {
  exercises: ExerciseDto[];
  onPick: (exercise: ExerciseDto) => void;
};

export function ExercisePicker({ exercises, onPick }: Readonly<ExercisePickerProps>) {
  const { t } = useTranslation();

  return (
    <aside className="flex w-full flex-col gap-cmv-sm lg:w-72">
      <span className="text-cmv-caption text-cmv-text-mid">{t("plan.session.pickerTitle")}</span>
      <div className="flex max-h-96 flex-col gap-cmv-xs overflow-y-auto">
        {exercises.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            onClick={() => onPick(exercise)}
            className="flex items-center justify-between gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-left transition-colors hover:border-cmv-border-hi hover:bg-cmv-surface-hi"
          >
            <span className="truncate text-cmv-body text-cmv-text-hi">{exercise.title}</span>
            <CmvBadge>{t(`library.category.${exercise.category}`)}</CmvBadge>
          </button>
        ))}
      </div>
    </aside>
  );
}
