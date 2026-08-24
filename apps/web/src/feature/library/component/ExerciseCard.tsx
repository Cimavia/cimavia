import { DocumentUsage, type ExerciseDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge, CmvCard, CmvTagList } from "@/shared/component";

type ExerciseCardProps = {
  exercise: ExerciseDto;
  onSelect: () => void;
};

export function ExerciseCard({ exercise, onSelect }: Readonly<ExerciseCardProps>) {
  const { t } = useTranslation();

  // Les images POSÉES dans la consigne sont des documents, mais pas des pièces jointes : les
  // compter gonflerait la pastille d'un chiffre que le coach ne retrouverait nulle part.
  const attachmentCount = exercise.documents.filter(
    (document) => document.usage === DocumentUsage.ATTACHMENT,
  ).length;

  return (
    <CmvCard onClick={onSelect} className="flex flex-col gap-cmv-sm">
      <h3 className="text-cmv-subtitle text-cmv-text-hi">{exercise.title}</h3>

      <p className="line-clamp-2 text-cmv-body text-cmv-text-mid">{exercise.description ?? "—"}</p>

      <div className="flex flex-wrap items-center gap-cmv-sm">
        <CmvTagList tags={exercise.tags} variant="accent" />
        {attachmentCount === 0 ? null : (
          <CmvBadge>{t("library.card.documentCount", { count: attachmentCount })}</CmvBadge>
        )}
      </div>
    </CmvCard>
  );
}
