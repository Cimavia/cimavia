import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoArrowDown, IoArrowUp, IoChevronDown, IoChevronForward } from "react-icons/io5";
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

/**
 * Ce qu'une ligne montre en plus de son ordre et de sa note : un résumé toujours visible dans son
 * en-tête, et un corps qui se déplie — le dosage, au panneau de séance planifiée (#518).
 */
export type CompositionDetail = { badge: ReactNode; body: ReactNode };

type CompositionEditorProps<T extends CompositionRow> = {
  items: readonly T[];
  onMove: (index: number, direction: -1 | 1) => void;
  /** Glisser connaît un départ et une arrivée ; les flèches, un cran. Deux gestes, deux formes. */
  onMoveTo: (from: number, to: number) => void;
  onRemove: (key: string) => void;
  onNoteChange: (key: string, value: string) => void;
  /** Sans lui, la ligne ne se déplie pas : elle n'a que son ordre et sa note. */
  detail?: (item: T) => CompositionDetail;
};

// La liste ordonnée des exercices d'une séance : ordre, note, retrait — et, dépliée, son détail.
export function CompositionEditor<T extends CompositionRow>({
  items,
  onMove,
  onMoveTo,
  onRemove,
  onNoteChange,
  detail,
}: Readonly<CompositionEditorProps<T>>) {
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
          detail={detail?.(item) ?? null}
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
  detail: CompositionDetail | null;
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
  detail,
  rowProps,
  dragHandle,
  isDropTarget,
  isDragging,
}: Readonly<CompositionEditorRowProps>) {
  const { t } = useTranslation();
  // Replié par défaut, comme la carte du constructeur : six grilles dépliées sont illisibles.
  const [open, setOpen] = useState(false);

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
        {detail == null ? (
          <span className="flex-1 truncate text-cmv-body text-cmv-text-hi">{item.title}</span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="flex flex-1 items-center gap-cmv-sm truncate text-left"
          >
            {open ? <IoChevronDown /> : <IoChevronForward />}
            <span className="truncate text-cmv-body text-cmv-text-hi">{item.title}</span>
          </button>
        )}
        <CmvTagList tags={item.tags} variant="accent" />
        {detail?.badge}

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

      {open ? detail?.body : null}

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
