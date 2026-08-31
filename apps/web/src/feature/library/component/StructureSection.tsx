import {
  BLOCK_LABEL_MAX_LENGTH,
  type BlockStructure,
  type CustomMetric,
  EXERCISE_MAX_BLOCKS,
  type ExerciseBlock,
  type ExerciseBlocks,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoArrowDown, IoArrowUp, IoTrashOutline } from "react-icons/io5";
import { BlockBandeau } from "@/feature/library/component/BlockBandeau";
import { BlockGrid } from "@/feature/library/component/BlockGrid";
import { BlockIssues } from "@/feature/library/component/BlockIssues";
import { BlockTypePicker } from "@/feature/library/component/BlockTypePicker";
import { CollapsedColumns } from "@/feature/library/component/CollapsedColumns";
import { MetricPicker } from "@/feature/library/component/MetricPicker";
import { createBlock } from "@/feature/library/util/block-factory.util";
import { CmvBadge, CmvButton, CmvEmptyState } from "@/shared/component";

// i18n-values library.builder.blockType: BlockType

type StructureSectionProps = {
  blocks: ExerciseBlocks;
  customMetrics: readonly CustomMetric[];
  onChange: (blocks: ExerciseBlocks) => void;
};

export function StructureSection({
  blocks,
  customMetrics,
  onChange,
}: Readonly<StructureSectionProps>) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  // UN seul menu de colonne ouvert sur la page, tous blocs confondus : deux panneaux flottants
  // se recouvrent, et le second masque celui qu'on croyait fermer.
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);

  const isFull = blocks.length >= EXERCISE_MAX_BLOCKS;

  function add(block: ExerciseBlock) {
    setPicking(false);
    onChange([...blocks, block]);
  }

  function replace(index: number, block: ExerciseBlock) {
    onChange(blocks.map((current, position) => (position === index ? block : current)));
  }

  function remove(index: number) {
    onChange(blocks.filter((_, position) => position !== index));
  }

  // L'ordre du tableau EST l'ordre d'affichage : déplacer une ligne suffit, rien à renuméroter.
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    if (moved == null) return;
    next.splice(target, 0, moved);
    onChange(next);
  }

  return (
    <section className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">{t("library.builder.structure")}</span>

      {blocks.length === 0 && !picking ? (
        <CmvEmptyState
          title={t("library.builder.noBlockTitle")}
          description={t("library.builder.noBlockDescription")}
          action={
            <CmvButton variant="secondary" onClick={() => setPicking(true)}>
              {t("library.builder.addBlock")}
            </CmvButton>
          }
        />
      ) : null}

      {blocks.map((block, index) => (
        <BlockCard
          key={block.id}
          block={block}
          customMetrics={customMetrics}
          index={index}
          isFirst={index === 0}
          isLast={index === blocks.length - 1}
          openMetricId={openMetricId}
          onOpenChange={setOpenMetricId}
          onChange={(next) => replace(index, next)}
          onMove={(direction) => move(index, direction)}
          onRemove={() => remove(index)}
        />
      ))}

      {picking ? (
        <div className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-md">
          <BlockTypePicker onPickType={(type) => add(createBlock(type))} />
          <div>
            <CmvButton variant="ghost" onClick={() => setPicking(false)}>
              {t("library.builder.cancel")}
            </CmvButton>
          </div>
        </div>
      ) : null}

      {blocks.length > 0 && !picking ? (
        <div>
          <CmvButton variant="secondary" onClick={() => setPicking(true)} disabled={isFull}>
            {t("library.builder.addBlock")}
          </CmvButton>
        </div>
      ) : null}
    </section>
  );
}

type BlockCardProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  index: number;
  isFirst: boolean;
  isLast: boolean;
  openMetricId: string | null;
  onOpenChange: (metricId: string | null) => void;
  onChange: (block: ExerciseBlock) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

function BlockCard({
  block,
  customMetrics,
  index,
  isFirst,
  isLast,
  openMetricId,
  onOpenChange,
  onChange,
  onMove,
  onRemove,
}: Readonly<BlockCardProps>) {
  const { t } = useTranslation();
  const [pickingMetrics, setPickingMetrics] = useState(false);

  return (
    <article className="flex flex-col gap-cmv-md rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md">
      <header className="flex flex-wrap items-center gap-cmv-sm">
        <span className="text-cmv-caption text-cmv-text-lo">{index + 1}</span>
        <CmvBadge variant="accent">
          {t(`library.builder.blockType.${block.structure.type}`)}
        </CmvBadge>

        <CmvButton variant="secondary" onClick={() => setPickingMetrics(true)}>
          {t("library.builder.metrics.edit")}
        </CmvButton>

        <input
          value={block.label ?? ""}
          maxLength={BLOCK_LABEL_MAX_LENGTH}
          onChange={(event) =>
            // Vidé → `null`, jamais `""` : le modèle porte l'absence, pas une chaîne vide.
            onChange({
              ...block,
              label: event.target.value.trim() === "" ? null : event.target.value,
            })
          }
          placeholder={t("library.builder.blockLabelPlaceholder")}
          aria-label={t("library.builder.blockLabel")}
          className="flex-1 rounded-cmv-sm border border-cmv-border bg-cmv-bg-1 px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
        />

        <CmvButton
          variant="ghost"
          title={t("library.builder.moveBlockUp")}
          disabled={isFirst}
          onClick={() => onMove(-1)}
        >
          <IoArrowUp />
        </CmvButton>
        <CmvButton
          variant="ghost"
          title={t("library.builder.moveBlockDown")}
          disabled={isLast}
          onClick={() => onMove(1)}
        >
          <IoArrowDown />
        </CmvButton>
        <CmvButton variant="danger" title={t("library.builder.removeBlock")} onClick={onRemove}>
          <IoTrashOutline />
        </CmvButton>
      </header>

      <BlockBandeau
        structure={block.structure}
        onChange={(structure: BlockStructure) => onChange({ ...block, structure })}
      />

      <MetricPicker
        open={pickingMetrics}
        block={block}
        customMetrics={customMetrics}
        onChange={onChange}
        onClose={() => setPickingMetrics(false)}
      />

      <CollapsedColumns block={block} customMetrics={customMetrics} onChange={onChange} />

      <BlockGrid
        block={block}
        customMetrics={customMetrics}
        openMetricId={openMetricId}
        onOpenChange={onOpenChange}
        onChange={onChange}
      />

      <BlockIssues block={block} customMetrics={customMetrics} />
    </article>
  );
}
