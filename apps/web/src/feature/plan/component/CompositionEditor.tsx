import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IoArrowDown, IoArrowUp } from "react-icons/io5";
import type { CompositionRow } from "@/feature/plan/hook/useComposition";
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
  onMove: (index: number, direction: -1 | 1) => void;
  /** Glisser connaît un départ et une arrivée ; les flèches, un cran. Deux gestes, deux formes. */
  onMoveTo: (from: number, to: number) => void;
  onRemove: (key: string) => void;
  onNoteChange: (key: string, value: string) => void;
};

// La liste ordonnée des exercices d'une séance : ordre, note, retrait.
export function CompositionEditor({
  items,
  onMove,
  onMoveTo,
  onRemove,
  onNoteChange,
}: Readonly<CompositionEditorProps>) {
  const { t } = useTranslation();
  const drag = useReorderDrag(onMoveTo);
  // Hors du JSX : imbriqué dans le gabarit du libellé, `check:i18n` ne verrait plus la clé.
  const moveLabel = t("plan.session.moveExercise");

  return (
    <div className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">{t("plan.session.composition")}</span>

      {items.length === 0 ? (
        <CmvEmptyState
          title={t("plan.session.emptyComposition")}
          description={t("plan.session.emptyCompositionHint")}
        />
      ) : null}

      {items.map((item, index) => (
        <CompositionEditorRow
          key={item.key}
          item={item}
          index={index}
          isFirst={index === 0}
          isLast={index === items.length - 1}
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
          title={t("plan.session.moveUp")}
          disabled={isFirst}
          onClick={() => onMove(index, -1)}
        >
          <IoArrowUp />
        </CmvButton>
        <CmvButton
          variant="ghost"
          title={t("plan.session.moveDown")}
          disabled={isLast}
          onClick={() => onMove(index, 1)}
        >
          <IoArrowDown />
        </CmvButton>
        <CmvButton variant="danger" onClick={() => onRemove(item.key)}>
          {t("plan.session.remove")}
        </CmvButton>
      </div>

      <CmvTextField
        label={t("plan.session.noteLabel")}
        name={`note-${item.key}`}
        value={item.note}
        onChange={(event) => onNoteChange(item.key, event.target.value)}
        placeholder={t("plan.session.notePlaceholder")}
      />
    </div>
  );
}
