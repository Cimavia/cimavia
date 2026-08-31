import {
  AdjustmentLevel,
  type Adjustments,
  adjustmentLevelAt,
  BLOCK_MAX_ROWS,
  type CustomMetric,
  cellPath,
  type ExerciseBlock,
  type ExerciseBlocks,
  type MetricValue,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { GridCell } from "@/feature/library/component/GridCell";
import { baselineValue } from "@/feature/library/util/dosage-summary.util";
import { metricLabel, metricUnitLabel } from "@/feature/library/util/metric-label.util";
import { CMV_TABLE, CmvButton, CmvDragHandle } from "@/shared/component";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { cn } from "@/shared/util/cn.util";

type SessionBlockGridProps = {
  block: ExerciseBlock;
  baseline: ExerciseBlocks;
  adjustments: Adjustments;
  customMetrics: readonly CustomMetric[];
  onCellChange: (rowId: string, metricId: string, value: MetricValue) => void;
  onRowsChange: (rows: ExerciseBlock["rows"]) => void;
  onRevertCell: (rowId: string, metricId: string) => void;
};

/**
 * La grille d'un exercice DANS une séance. Elle diffère de celle du constructeur d'exercice sur
 * ce qui compte : les colonnes n'y sont pas éditables — pas de menu, pas d'unité, pas de
 * remplissage en masse. Le coach ajuste des VALEURS, pas la forme.
 *
 * Chaque valeur ajustée porte son marqueur et son défaut, avec de quoi y revenir. Le marqueur
 * vient de la donnée (`adjustments`), jamais d'une comparaison avec la référence.
 */
export function SessionBlockGrid({
  block,
  baseline,
  adjustments,
  customMetrics,
  onCellChange,
  onRowsChange,
  onRevertCell,
}: Readonly<SessionBlockGridProps>) {
  const { t } = useTranslation();

  const shown = block.metrics.filter((metric) => !metric.collapsed);
  const isFull = block.rows.length >= BLOCK_MAX_ROWS;

  function moveRow(from: number, to: number) {
    if (to < 0 || to >= block.rows.length || from === to) return;
    const next = [...block.rows];
    const [moved] = next.splice(from, 1);
    if (moved == null) return;
    next.splice(to, 0, moved);
    onRowsChange(next);
  }

  const drag = useReorderDrag(moveRow);

  function addRow() {
    if (isFull) return;
    const last = block.rows.at(-1);
    onRowsChange([...block.rows, { id: crypto.randomUUID(), values: { ...last?.values } }]);
  }

  return (
    <div className="flex flex-col gap-cmv-sm">
      <div className={cn("overflow-x-auto", CMV_TABLE.frame)}>
        <table className={CMV_TABLE.table}>
          <thead>
            <tr className={cn(CMV_TABLE.head, block.rows.length > 0 && CMV_TABLE.headBorder)}>
              <th className={cn("w-20", CMV_TABLE.headCell)} scope="col">
                <span className="sr-only">{t("library.builder.grid.rowIndex")}</span>
              </th>
              {shown.map((metric) => {
                const unit = metricUnitLabel(metric, customMetrics, t);
                return (
                  <th key={metric.id} scope="col" className={CMV_TABLE.headCell}>
                    {/* Un libellé, pas un menu : la colonne est verrouillée au niveau séance. */}
                    <span className={CMV_TABLE.headLabel}>
                      {metricLabel(metric, customMetrics, t)}
                    </span>
                    {unit == null ? null : (
                      <span className="block text-cmv-caption text-cmv-text-lo">{unit}</span>
                    )}
                  </th>
                );
              })}
              <th className={cn("w-10", CMV_TABLE.headCell)} scope="col">
                <span className="sr-only">{t("library.builder.grid.rowActions")}</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {block.rows.map((row, index) => (
              <tr
                key={row.id}
                {...drag.rowProps(index)}
                className={cn(
                  CMV_TABLE.row,
                  drag.isDragging(index) && "opacity-40",
                  drag.isOver(index) && "bg-cmv-accent-soft",
                )}
              >
                <td className={CMV_TABLE.cell}>
                  <div className="flex items-center gap-cmv-xs">
                    <CmvDragHandle
                      label={`${t("library.builder.grid.moveRow")} ${index + 1}`}
                      {...drag.handleProps(index)}
                      onMove={(direction) => moveRow(index, index + direction)}
                    />
                    <span className={CMV_TABLE.index}>{index + 1}</span>
                  </div>
                </td>

                {shown.map((metric) => (
                  <td key={metric.id} className={CMV_TABLE.cell}>
                    <GridCell
                      metric={metric}
                      customMetrics={customMetrics}
                      value={row.values[metric.id] ?? null}
                      onChange={(value) => onCellChange(row.id, metric.id, value)}
                      onCommitLine={() => {
                        if (index === block.rows.length - 1) addRow();
                      }}
                    />
                    <AdjustedHint
                      level={adjustmentLevelAt(adjustments, cellPath(block.id, row.id, metric.id))}
                      base={baselineValue(baseline, block.id, row.id, metric.id)}
                      onRevert={() => onRevertCell(row.id, metric.id)}
                    />
                  </td>
                ))}

                <td className={CMV_TABLE.cell}>
                  <CmvButton
                    variant="ghost"
                    title={t("library.builder.grid.removeRow")}
                    onClick={() => onRowsChange(block.rows.filter((item) => item.id !== row.id))}
                  >
                    <IoTrashOutline />
                  </CmvButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CmvButton variant="secondary" onClick={addRow} disabled={isFull}>
        {t("library.builder.grid.addRow")}
      </CmvButton>
    </div>
  );
}

/**
 * Sous une valeur ajustée : d'où elle vient et comment y revenir.
 *
 * La FORME distingue les deux niveaux autant que la couleur — rond pour la séance, carré pour
 * l'athlète. Les deux marqueurs coexistent sur la même grille, et une couleur seule serait
 * illisible pour un daltonien.
 */
function AdjustedHint({
  level,
  base,
  onRevert,
}: Readonly<{ level: AdjustmentLevel | null; base: MetricValue; onRevert: () => void }>) {
  const { t } = useTranslation();
  if (level == null) return null;

  return (
    <div className="flex items-center gap-cmv-xs pt-cmv-xs">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0",
          level === AdjustmentLevel.SESSION
            ? "rounded-cmv-pill bg-cmv-accent"
            : "rounded-cmv-sm bg-cmv-info",
        )}
      />
      <span className="text-cmv-caption text-cmv-text-lo">
        {t("library.session.defaultValue", { value: base == null ? "—" : String(base) })}
      </span>
      <button
        type="button"
        onClick={onRevert}
        className="text-cmv-caption text-cmv-accent hover:underline"
      >
        {t("library.session.revert")}
      </button>
    </div>
  );
}
