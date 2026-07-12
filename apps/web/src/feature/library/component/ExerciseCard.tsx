import type { ExerciseDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge, CmvCard } from "@/shared/component";

type ExerciseCardProps = {
  exercise: ExerciseDto;
  onSelect: (exercise: ExerciseDto) => void;
};

export function ExerciseCard({ exercise, onSelect }: Readonly<ExerciseCardProps>) {
  const { t } = useTranslation();

  return (
    <CmvCard onClick={() => onSelect(exercise)} className="flex flex-col gap-cmv-sm">
      <h3 className="text-cmv-subtitle text-cmv-text-hi">{exercise.title}</h3>

      <p className="line-clamp-2 text-cmv-body text-cmv-text-mid">{exercise.description ?? "—"}</p>

      <div className="flex items-center gap-cmv-sm">
        <CmvBadge variant="accent">{t(`library.category.${exercise.category}`)}</CmvBadge>
        {exercise.documents.length === 0 ? null : (
          <CmvBadge>
            {t("library.exercise.documentCount", { count: exercise.documents.length })}
          </CmvBadge>
        )}
      </div>
    </CmvCard>
  );
}
