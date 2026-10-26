import {
  type BlockGrid,
  type BlockGridSlot,
  BlockSlotKind,
  type CustomMetric,
  filledGridRows,
  type GridMetric,
  MetricSource,
  metricUnitLabel,
  withGridMetrics,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { ColumnPopover } from "@/feature/library/component/ColumnMenu";
import { GridCell } from "@/feature/library/component/GridCell";
import { MetricPicker } from "@/feature/library/component/MetricPicker";
import { useGridRows } from "@/feature/library/hook/useGridRows";
import { CMV_EDIT, CMV_TABLE, CmvButton, CmvDragHandle } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type BlockExerciseGridProps = {
  grid: BlockGrid;
  /** Le nombre de tours que la grille montre (`gridRowLimit`). */
  limit: number;
  /** Où se nomment les colonnes : le catalogue, et celui du propriétaire de l'exercice (#605). */
  customMetrics: readonly CustomMetric[];
  /** Ce qui se pose en colonne (`MetricPicker`) ; `null` tant que le catalogue ne se lit pas. */
  pickable: readonly CustomMetric[] | null;
  catalogOwner: string | null;
  onChange: (grid: BlockGrid) => void;
};

const newId = () => crypto.randomUUID();

/**
 * La grille d'un exercice de bloc (#719, maquette `coach_constructeur_seance_v2`, frames 3 à 5) :
 * une colonne par métrique, une ligne par tour. Les tours sans ligne sont des fantômes de la
 * dernière ; les lignes au-delà des tours restent visibles, non jouées, jusqu'à l'enregistrement
 * qui les retire (`fittedBlock`).
 *
 * Une grille sans colonne est valide : une routine de mobilité n'a rien à mesurer.
 */
export function BlockExerciseGrid({
  grid,
  limit,
  customMetrics,
  pickable,
  catalogOwner,
  onChange,
}: Readonly<BlockExerciseGridProps>) {
  const { t } = useTranslation();
  const rows = useGridRows(grid.rows, limit, (next) => onChange({ ...grid, rows: next }));
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  function setMetric(metricId: string, change: (metric: GridMetric) => GridMetric) {
    onChange({
      ...grid,
      metrics: grid.metrics.map((metric) => (metric.id === metricId ? change(metric) : metric)),
    });
  }

  return (
    <div className="flex flex-col gap-cmv-xs">
      {grid.metrics.length === 0 ? (
        <p className="text-cmv-caption text-cmv-text-lo">{t("library.session.blocks.noMetric")}</p>
      ) : (
        // `overflow-x-auto` : au-delà de quatre ou cinq colonnes, c'est au tableau de défiler.
        <div className={cn("overflow-x-auto", CMV_TABLE.frame)}>
          <table className={CMV_TABLE.table}>
            <thead>
              <tr className={cn(CMV_TABLE.head, CMV_TABLE.headBorder)}>
                <th className={cn("w-16", CMV_TABLE.headCell)} scope="col">
                  <span className={CMV_TABLE.headLabel}>{t("library.session.blocks.round")}</span>
                </th>
                {grid.metrics.map((metric) => {
                  const unit = metricUnitLabel(metric, customMetrics, t);
                  return (
                    <th key={metric.id} scope="col" className={CMV_TABLE.headCell}>
                      <ColumnPopover
                        metric={metric}
                        customMetrics={customMetrics}
                        open={openMetricId === metric.id}
                        onOpenChange={(open) => setOpenMetricId(open ? metric.id : null)}
                        firstValue={grid.rows[0]?.values[metric.id] ?? null}
                        hasRows={grid.rows.length > 0}
                        onUnit={(next) => {
                          setMetric(metric.id, (current) =>
                            current.source === MetricSource.CATALOG
                              ? { ...current, unit: next }
                              : current,
                          );
                          setOpenMetricId(null);
                        }}
                        onFill={(plan) => {
                          onChange({
                            ...grid,
                            rows: filledGridRows(grid.rows, limit, metric.id, plan, () => newId()),
                          });
                          setOpenMetricId(null);
                        }}
                      >
                        <div className="border-cmv-border border-t pt-cmv-sm">
                          <CmvButton
                            variant="ghost"
                            onClick={() => {
                              onChange(
                                withGridMetrics(
                                  grid,
                                  grid.metrics.filter((other) => other.id !== metric.id),
                                ),
                              );
                              setOpenMetricId(null);
                            }}
                          >
                            {t("library.session.blocks.removeColumn")}
                          </CmvButton>
                        </div>
                      </ColumnPopover>
                      {unit == null ? null : (
                        <span className="block text-cmv-caption text-cmv-text-lo">{unit}</span>
                      )}
                    </th>
                  );
                })}
                <th className={cn("w-10", CMV_TABLE.headCell, CMV_EDIT.only)} scope="col">
                  <span className="sr-only">{t("library.builder.grid.rowActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slots.map((slot) => (
                <GridRowView
                  key={rows.keyOf(slot)}
                  slot={slot}
                  metrics={grid.metrics}
                  customMetrics={customMetrics}
                  rows={rows}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={cn("flex flex-wrap items-center gap-cmv-md", CMV_EDIT.only)}>
        <CmvButton variant="ghost" onClick={() => setPicking(true)}>
          {t("library.builder.metrics.edit")}
        </CmvButton>
        {grid.metrics.length === 0 ? null : (
          <span className="text-cmv-caption text-cmv-text-lo">
            {t("library.session.blocks.emptyCell")}
          </span>
        )}
      </div>

      <MetricPicker
        open={picking}
        metrics={grid.metrics}
        create={(metric) => ({ ...metric, id: newId(), label: null }) as GridMetric}
        customMetrics={customMetrics}
        pickable={pickable}
        catalogOwner={catalogOwner}
        // Une colonne retirée emporte ses valeurs : gardées, elles seraient orphelines.
        onChange={(metrics) => onChange(withGridMetrics(grid, metrics))}
        onClose={() => setPicking(false)}
      />
    </div>
  );
}

type GridRowViewProps = {
  slot: BlockGridSlot;
  metrics: readonly GridMetric[];
  customMetrics: readonly CustomMetric[];
  rows: ReturnType<typeof useGridRows>;
};

/**
 * Une ligne, quelle que soit sa nature : UN seul `<tr>` aux mêmes positions, pour que le fantôme
 * qui se matérialise garde ses cellules — et le focus du Coach qui tabule (`BlockGridRow`).
 */
function GridRowView({ slot, metrics, customMetrics, rows }: Readonly<GridRowViewProps>) {
  const { t } = useTranslation();
  const { index } = slot;
  const row = slot.kind === BlockSlotKind.GHOST ? null : slot.row;
  const shown = slot.kind === BlockSlotKind.GHOST ? slot.source : slot.row;
  const muted = slot.kind !== BlockSlotKind.ROW;

  return (
    <tr
      {...(row == null ? {} : rows.drag.rowProps(index))}
      className={cn(
        CMV_TABLE.row,
        rows.drag.isDragging(index) && "opacity-40",
        rows.drag.isOver(index) && "bg-cmv-accent-soft",
      )}
    >
      <td className={CMV_TABLE.cell}>
        <div className="flex items-center gap-cmv-xs">
          {row == null ? null : (
            <span className={CMV_EDIT.only}>
              <CmvDragHandle
                label={`${t("library.builder.grid.moveRow")} ${index + 1}`}
                {...rows.drag.handleProps(index)}
                onMove={(direction) => rows.moveRow(index, index + direction)}
              />
            </span>
          )}
          <span className={cn(CMV_TABLE.index, muted && "opacity-60")}>{index + 1}</span>
          {slot.kind === BlockSlotKind.BEYOND ? (
            <span className="whitespace-nowrap text-cmv-caption text-cmv-text-lo italic">
              {t("library.session.blocks.beyond")}
            </span>
          ) : null}
        </div>
      </td>

      {metrics.map((metric) => (
        <td key={metric.id} className={CMV_TABLE.cell}>
          <GridCell
            metric={metric}
            customMetrics={customMetrics}
            value={shown?.values[metric.id] ?? null}
            ghost={muted}
            placeholder={row == null ? t("library.builder.grid.emptyValue") : undefined}
            onChange={(value) => rows.write(slot, metric.id, value)}
            // Entrée valide seulement : les tours fixent le nombre de lignes.
            onCommitLine={() => undefined}
          />
        </td>
      ))}

      <td className={cn(CMV_TABLE.cell, CMV_EDIT.only)}>
        {row == null ? null : (
          <CmvButton
            variant="ghost"
            title={t("library.builder.grid.removeRow")}
            onClick={() => rows.removeRow(row.id)}
          >
            <IoTrashOutline />
          </CmvButton>
        )}
      </td>
    </tr>
  );
}
