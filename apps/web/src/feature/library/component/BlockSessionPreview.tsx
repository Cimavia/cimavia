import { blockNumbers, type CustomMetric, type SessionBlock } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { BlockReading } from "@/feature/library/component/BlockReading";
import { CmvCard } from "@/shared/component";

type BlockSessionPreviewProps = {
  blocks: readonly SessionBlock[];
  /** Le titre de chaque exercice, par clé ; `null` quand il ne se lit pas encore. */
  titleOf: (key: string) => string | null;
  customMetrics: readonly CustomMetric[];
};

/**
 * Ce que l'athlète lira de la séance (#719, maquette `coach_constructeur_seance_v2`, frame 8) :
 * bloc par bloc, comme `BlockReading` les rend — la séance planifiée (#722) les lit de même.
 */
export function BlockSessionPreview({
  blocks,
  titleOf,
  customMetrics,
}: Readonly<BlockSessionPreviewProps>) {
  const { t } = useTranslation();
  const numbers = blockNumbers(blocks);

  return (
    <CmvCard>
      <div className="flex flex-col gap-cmv-lg">
        <span className="text-cmv-caption text-cmv-text-mid">
          {t("library.session.blocks.previewTitle")}
        </span>
        {blocks.length === 0 ? (
          <p className="text-cmv-body text-cmv-text-lo">{t("library.session.previewEmpty")}</p>
        ) : (
          blocks.map((block, index) => (
            <BlockReading
              key={block.id}
              number={numbers[index] ?? null}
              label={block.label}
              settings={block.settings}
              instructions={block.instructions}
              exercises={block.exercises.map((exercise) => ({
                id: exercise.key,
                name: titleOf(exercise.key) ?? "—",
                grid: exercise.grid,
                note: exercise.note,
                customMetrics,
              }))}
            />
          ))
        )}
      </div>
    </CmvCard>
  );
}
