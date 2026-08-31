import {
  ColumnFillMode,
  type CustomMetric,
  columnValues,
  type ExerciseBlock,
  fillColumn,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { GridCell } from "@/feature/library/component/GridCell";
import { metricLabel, metricUnitLabel } from "@/feature/library/util/metric-label.util";
import { CmvButton } from "@/shared/component";

type CollapsedColumnsProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  onChange: (block: ExerciseBlock) => void;
};

/**
 * Les colonnes repliées, montrées à côté du bandeau : « Repos 2'30 » plutôt qu'une colonne de
 * quatre cases identiques.
 *
 * La valeur reste dans les LIGNES — l'éditer les réécrit toutes. C'est ce qui rend le repli
 * réversible : redéployer la colonne retrouve exactement ce qui y était.
 */
export function CollapsedColumns({
  block,
  customMetrics,
  onChange,
}: Readonly<CollapsedColumnsProps>) {
  const { t } = useTranslation();
  const collapsed = block.metrics.filter((metric) => metric.collapsed);
  if (collapsed.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-cmv-md">
      {collapsed.map((metric) => {
        const unit = metricUnitLabel(metric, customMetrics, t);
        return (
          <div key={metric.id} className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-caption text-cmv-text-mid">
              {metricLabel(metric, customMetrics, t)}
              {unit == null ? null : <span className="text-cmv-text-lo"> · {unit}</span>}
            </span>
            <div className="flex items-center gap-cmv-xs">
              <div className="w-24 rounded-cmv-sm border border-cmv-border bg-cmv-surface">
                <GridCell
                  metric={metric}
                  customMetrics={customMetrics}
                  value={columnValues(block, metric.id)[0] ?? null}
                  onChange={(value) =>
                    onChange({
                      ...block,
                      rows: fillColumn(block, metric.id, { mode: ColumnFillMode.SAME, value }),
                    })
                  }
                  onCommitLine={() => undefined}
                />
              </div>
              <CmvButton
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...block,
                    metrics: block.metrics.map((current) =>
                      current.id === metric.id ? { ...current, collapsed: false } : current,
                    ),
                  })
                }
              >
                {t("library.builder.column.expand")}
              </CmvButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
