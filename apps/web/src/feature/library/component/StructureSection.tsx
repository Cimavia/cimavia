import {
  BLOCK_LABEL_MAX_LENGTH,
  type BlockStructure,
  EXERCISE_MAX_BLOCKS,
  type ExerciseBlock,
  type ExerciseBlocks,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoArrowDown, IoArrowUp, IoTrashOutline } from "react-icons/io5";
import { BlockBandeau } from "@/feature/library/component/BlockBandeau";
import { BlockTypePicker } from "@/feature/library/component/BlockTypePicker";
import { createBlock, createShortcutBlock } from "@/feature/library/util/block-factory.util";
import { CmvBadge, CmvButton, CmvEmptyState } from "@/shared/component";

// i18n-values library.builder.blockType: BlockType

type StructureSectionProps = {
  blocks: ExerciseBlocks;
  onChange: (blocks: ExerciseBlocks) => void;
};

export function StructureSection({ blocks, onChange }: Readonly<StructureSectionProps>) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);

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
          index={index}
          isFirst={index === 0}
          isLast={index === blocks.length - 1}
          showLabel={blocks.length > 1}
          onChange={(next) => replace(index, next)}
          onMove={(direction) => move(index, direction)}
          onRemove={() => remove(index)}
        />
      ))}

      {picking ? (
        <div className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-md">
          <BlockTypePicker
            onPickType={(type) => add(createBlock(type))}
            onPickShortcut={(shortcut) => add(createShortcutBlock(shortcut))}
          />
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
  index: number;
  isFirst: boolean;
  isLast: boolean;
  /** Le libellé n'apparaît qu'à partir de DEUX blocs : nommer un bloc unique n'apprend rien. */
  showLabel: boolean;
  onChange: (block: ExerciseBlock) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

function BlockCard({
  block,
  index,
  isFirst,
  isLast,
  showLabel,
  onChange,
  onMove,
  onRemove,
}: Readonly<BlockCardProps>) {
  const { t } = useTranslation();

  return (
    <article className="flex flex-col gap-cmv-md rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md">
      <header className="flex flex-wrap items-center gap-cmv-sm">
        <span className="text-cmv-caption text-cmv-text-lo">{index + 1}</span>
        <CmvBadge variant="accent">
          {t(`library.builder.blockType.${block.structure.type}`)}
        </CmvBadge>

        {showLabel ? (
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
        ) : (
          <span className="flex-1" />
        )}

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
    </article>
  );
}
