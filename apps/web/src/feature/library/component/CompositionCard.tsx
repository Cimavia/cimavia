import {
  AdjustmentLevel,
  type CustomMetric,
  type ExerciseBlock,
  type MetricValue,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IoArrowDown,
  IoArrowUp,
  IoChevronDown,
  IoChevronForward,
  IoEllipsisHorizontal,
} from "react-icons/io5";
import { DosageEditor } from "@/feature/library/component/DosageEditor";
import type { CompositionItem } from "@/feature/library/hook/useSessionDraft";
import { dosageSummary } from "@/feature/library/util/dosage-summary.util";
import { CmvBadge, CmvButton, CmvTagList, CmvTextField } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type CompositionCardProps = {
  item: CompositionItem;
  customMetrics: readonly CustomMetric[];
  isReloading: boolean;
  onNoteChange: (note: string) => void;
  onCellChange: (blockId: string, rowId: string, metricId: string, value: MetricValue) => void;
  onStructureChange: (blockId: string, structure: ExerciseBlock["structure"]) => void;
  onRowsChange: (blockId: string, rows: ExerciseBlock["rows"]) => void;
  onRevertCell: (blockId: string, rowId: string, metricId: string) => void;
  onRevertStructureField: (blockId: string, field: string) => void;
  onResetAll: () => void;
  onReload: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  dragHandle: React.ReactNode;
  /** La cible de dépôt se teinte ICI : posée sur un parent, le fond de la carte la masquerait. */
  isDropTarget: boolean;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
};

/**
 * Un exercice dans une séance. **Replié par défaut** : une séance de six exercices dépliés est
 * illisible, et la phrase de dosage suffit à reconnaître ce qu'on a composé.
 */
export function CompositionCard({
  item,
  customMetrics,
  isReloading,
  onNoteChange,
  onCellChange,
  onStructureChange,
  onRowsChange,
  onRevertCell,
  onRevertStructureField,
  onResetAll,
  onReload,
  onDuplicate,
  onRemove,
  dragHandle,
  isDropTarget,
  onMove,
  isFirst,
  isLast,
}: Readonly<CompositionCardProps>) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);

  const summary = dosageSummary(item.blocks, customMetrics, t, i18n.language);
  const adjustedCount = item.adjustments.length;

  return (
    <article
      className={cn(
        "flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border p-cmv-md",
        isDropTarget ? "bg-cmv-accent-soft" : "bg-cmv-surface",
      )}
    >
      <header className="flex flex-wrap items-center gap-cmv-sm">
        {dragHandle}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-cmv-sm text-left"
        >
          {open ? <IoChevronDown /> : <IoChevronForward />}
          <span className="text-cmv-body text-cmv-text-hi">{item.title}</span>
        </button>
        <CmvTagList tags={item.tags} />
        {adjustedCount === 0 ? null : (
          <CmvBadge variant="accent">
            {t("library.session.adjustedCount", { count: adjustedCount })}
          </CmvBadge>
        )}

        {/* Les flèches doublent le glisser : celui-ci est inaccessible au clavier, et le
            constructeur d'exercice les propose déjà sur ses blocs. */}
        <CmvButton
          variant="ghost"
          title={t("library.session.moveUp")}
          disabled={isFirst}
          onClick={() => onMove(-1)}
        >
          <IoArrowUp />
        </CmvButton>
        <CmvButton
          variant="ghost"
          title={t("library.session.moveDown")}
          disabled={isLast}
          onClick={() => onMove(1)}
        >
          <IoArrowDown />
        </CmvButton>

        <div className="relative">
          <CmvButton
            variant="ghost"
            title={t("library.session.cardMenu")}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <IoEllipsisHorizontal />
          </CmvButton>
          {menuOpen ? (
            <div className="absolute right-0 z-10 mt-cmv-xs flex w-72 flex-col items-start gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-sm shadow-lg">
              <CmvButton
                variant="ghost"
                disabled={adjustedCount === 0}
                onClick={() => {
                  onResetAll();
                  setMenuOpen(false);
                }}
              >
                {t("library.session.resetAll")}
              </CmvButton>
              <CmvButton
                variant="ghost"
                disabled={item.id == null || isReloading}
                onClick={() => {
                  setConfirmReload(true);
                  setMenuOpen(false);
                }}
              >
                {t("library.session.reload")}
              </CmvButton>
              <CmvButton variant="ghost" onClick={onDuplicate}>
                {t("library.session.duplicate")}
              </CmvButton>
              <CmvButton variant="danger" onClick={onRemove}>
                {t("library.session.remove")}
              </CmvButton>
            </div>
          ) : null}
        </div>
      </header>

      {/* Le rechargement ÉCRASE et perd les ajustements : il se confirme, et la confirmation dit
          combien on en perd — « es-tu sûr » sans chiffre ne se décide pas. À zéro, rien à perdre :
          `reloadWarning_zero` le dit, sans quoi le français, qui range 0 au singulier, annoncerait
          « Ton ajustement sera perdu ». Les AUTRES exercices ne sont pas touchés (#300). */}
      {confirmReload ? (
        <div className="flex flex-wrap items-center gap-cmv-sm rounded-cmv-sm border border-cmv-warning-line bg-cmv-warning-soft px-cmv-md py-cmv-sm">
          <span className="flex-1 text-cmv-caption text-cmv-warning-on">
            {t("library.session.reloadWarning", { count: adjustedCount })}
          </span>
          <CmvButton variant="ghost" onClick={() => setConfirmReload(false)}>
            {t("library.builder.cancel")}
          </CmvButton>
          <CmvButton
            onClick={() => {
              onReload();
              setConfirmReload(false);
            }}
          >
            {t("library.session.reloadConfirm")}
          </CmvButton>
        </div>
      ) : null}

      {summary == null ? null : <p className="text-cmv-caption text-cmv-text-mid">{summary}</p>}

      {open ? (
        <div className="flex flex-col gap-cmv-lg">
          <DosageEditor
            dosage={item}
            level={AdjustmentLevel.SESSION}
            customMetrics={customMetrics}
            onCellChange={onCellChange}
            onStructureChange={onStructureChange}
            onRowsChange={onRowsChange}
            onRevertCell={onRevertCell}
            onRevertStructureField={onRevertStructureField}
          />

          <CmvTextField
            label={t("library.session.noteLabel")}
            name={`note-${item.key}`}
            value={item.note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={t("library.session.notePlaceholder")}
          />
        </div>
      ) : null}
    </article>
  );
}
