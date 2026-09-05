import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IoArrowDown, IoArrowUp } from "react-icons/io5";
import type { CompositionRow } from "@/feature/library/hook/useComposition";
import {
  CmvButton,
  CmvDragHandle,
  CmvEmptyState,
  CmvTagList,
  CmvTextField,
} from "@/shared/component";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { cn } from "@/shared/util/cn.util";

type CompositionEditorProps = {
  items: readonly CompositionRow[];
  /**
   * Espace de clés i18n — `library.session` ou `plan.session`. Les libellés diffèrent (on ne parle
   * pas d'un modèle et d'une séance datée de la même façon) alors que la manipulation est la même.
   */
  labelPrefix: string;
  onMove: (index: number, direction: -1 | 1) => void;
  /** Glisser connaît un départ et une arrivée ; les flèches, un cran. Deux gestes, deux formes. */
  onMoveTo: (from: number, to: number) => void;
  onRemove: (key: string) => void;
  onNoteChange: (key: string, value: string) => void;
};

// La liste ordonnée des exercices d'une séance : ordre, note, retrait.
export function CompositionEditor({
  items,
  labelPrefix,
  onMove,
  onMoveTo,
  onRemove,
  onNoteChange,
}: Readonly<CompositionEditorProps>) {
  const { t } = useTranslation();
  const drag = useReorderDrag(onMoveTo);
  // Hors du JSX : imbriqué dans le gabarit du libellé, `check:i18n` ne verrait plus la clé.
  const moveLabel = t(`${labelPrefix}.moveExercise`);

  return (
    <div className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">{t(`${labelPrefix}.composition`)}</span>

      {items.length === 0 ? (
        <CmvEmptyState
          title={t(`${labelPrefix}.emptyComposition`)}
          description={t(`${labelPrefix}.emptyCompositionHint`)}
        />
      ) : null}

      {items.map((item, index) => (
        <CompositionEditorRow
          key={item.key}
          item={item}
          index={index}
          isFirst={index === 0}
          isLast={index === items.length - 1}
          labelPrefix={labelPrefix}
          onMove={onMove}
          onRemove={onRemove}
          onNoteChange={onNoteChange}
          rowProps={drag.rowProps(index)}
          isDropTarget={drag.isOver(index)}
          isDragging={drag.isDragging(index)}
          dragHandle={
            <CmvDragHandle
              label={`${moveLabel} ${index + 1}`}
              {...drag.handleProps(index)}
              onMove={(direction) => onMove(index, direction)}
            />
          }
        />
      ))}
    </div>
  );
}

type CompositionEditorRowProps = {
  item: CompositionRow;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  labelPrefix: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
  onNoteChange: (key: string, value: string) => void;
  rowProps: Record<string, unknown>;
  dragHandle: ReactNode;
  /** La cible de dépôt se teinte ICI : le fond de la ligne masquerait une teinte posée au-dessus. */
  isDropTarget: boolean;
  isDragging: boolean;
};

function CompositionEditorRow({
  item,
  index,
  isFirst,
  isLast,
  labelPrefix,
  onMove,
  onRemove,
  onNoteChange,
  rowProps,
  dragHandle,
  isDropTarget,
  isDragging,
}: Readonly<CompositionEditorRowProps>) {
  const { t } = useTranslation();

  return (
    <div
      {...rowProps}
      className={cn(
        "flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border p-cmv-md",
        isDragging && "opacity-40",
        isDropTarget ? "bg-cmv-accent-soft" : "bg-cmv-surface",
      )}
    >
      <div className="flex items-center gap-cmv-sm">
        {dragHandle}
        <span className="text-cmv-caption text-cmv-text-lo">{index + 1}</span>
        <span className="flex-1 truncate text-cmv-body text-cmv-text-hi">{item.title}</span>
        <CmvTagList tags={item.tags} variant="accent" />

        {/* Les flèches doublent le glisser, inaccessible au clavier — même dispositif que la
            carte de composition du constructeur de séance. */}
        <CmvButton
          variant="ghost"
          title={t(`${labelPrefix}.moveUp`)}
          disabled={isFirst}
          onClick={() => onMove(index, -1)}
        >
          <IoArrowUp />
        </CmvButton>
        <CmvButton
          variant="ghost"
          title={t(`${labelPrefix}.moveDown`)}
          disabled={isLast}
          onClick={() => onMove(index, 1)}
        >
          <IoArrowDown />
        </CmvButton>
        <CmvButton variant="danger" onClick={() => onRemove(item.key)}>
          {t(`${labelPrefix}.remove`)}
        </CmvButton>
      </div>

      <CmvTextField
        label={t(`${labelPrefix}.noteLabel`)}
        name={`note-${item.key}`}
        value={item.note}
        onChange={(event) => onNoteChange(item.key, event.target.value)}
        placeholder={t(`${labelPrefix}.notePlaceholder`)}
      />
    </div>
  );
}
