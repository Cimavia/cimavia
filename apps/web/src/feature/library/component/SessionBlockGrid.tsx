import {
  AdjustmentLevel,
  type AdjustmentLevelType,
  type Adjustments,
  adjustmentLevelAt,
  type BlockMetric,
  type CustomMetric,
  cellPath,
  type ExerciseBlock,
  type ExerciseBlocks,
  formatMetricValue,
  type MetricValue,
  metricLabel,
  metricUnitLabel,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { AdjustmentMarker } from "@/feature/library/component/AdjustmentMarker";
import { BlockGridHead, BlockGridRow } from "@/feature/library/component/BlockGridRow";
import { useBlockRows } from "@/feature/library/hook/useBlockRows";
import { baselineValue } from "@/feature/library/util/dosage-summary.util";
import { CMV_TABLE, CmvButton } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type SessionBlockGridProps = {
  /** Le niveau qui édite : seuls SES marqueurs offrent d'y revenir (#518). */
  level: AdjustmentLevelType;
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
 *
 * La même grille sert la séance-type et la séance planifiée (#518) : une seule mécanique,
 * paramétrée par le niveau qui édite.
 */
export function SessionBlockGrid({
  level,
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
  // Une série FANTÔME qui se matérialise est une ligne ajoutée dans la séance : comme toute ligne
  // absente de la référence, elle ne porte aucun marqueur, et la corbeille la rend fantôme (#520).
  const rows = useBlockRows(block, onRowsChange);

  return (
    <div className="flex flex-col gap-cmv-sm">
      <div className={cn("overflow-x-auto", CMV_TABLE.frame)}>
        <table className={CMV_TABLE.table}>
          <BlockGridHead isSeries={rows.isSeries} hasRows={rows.slots.length > 0}>
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
          </BlockGridHead>

          <tbody>
            {rows.slots.map((slot) => (
              <BlockGridRow
                key={rows.keyOf(slot)}
                slot={slot}
                metrics={shown}
                customMetrics={customMetrics}
                rows={rows}
                onCellChange={onCellChange}
                renderCellExtra={(rowId, metric) => (
                  <AdjustedHint
                    metric={metric}
                    customMetrics={customMetrics}
                    editing={level}
                    marker={adjustmentLevelAt(adjustments, cellPath(block.id, rowId, metric.id))}
                    base={baselineValue(baseline, block.id, rowId, metric.id)}
                    onRevert={() => onRevertCell(rowId, metric.id)}
                  />
                )}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* En Séries, c'est le champ « Séries » du bandeau qui fixe le nombre de lignes. */}
      {rows.canAddRow ? (
        <CmvButton variant="secondary" onClick={rows.addRow} disabled={rows.isFull}>
          {t("library.builder.grid.addRow")}
        </CmvButton>
      ) : null}
    </div>
  );
}

/**
 * Sous une valeur ajustée : d'où elle vient et comment y revenir.
 *
 * Seul un marqueur du niveau QUI ÉDITE offre d'y revenir. Celui d'un niveau précédent — le rond
 * d'une valeur décidée dans la séance-type, vu depuis la séance planifiée — dit seulement d'où vient
 * la valeur : elle EST déjà la référence de ce niveau, « Revenir » n'aurait rien à rendre.
 */
function AdjustedHint({
  metric,
  customMetrics,
  editing,
  marker,
  base,
  onRevert,
}: Readonly<{
  metric: BlockMetric;
  customMetrics: readonly CustomMetric[];
  editing: AdjustmentLevelType;
  marker: AdjustmentLevelType | null;
  base: MetricValue;
  onRevert: () => void;
}>) {
  const { t, i18n } = useTranslation();
  if (marker == null) return null;

  if (marker !== editing) {
    return (
      <div className="flex items-center gap-cmv-xs pt-cmv-xs">
        <AdjustmentMarker level={marker} />
        <span className="text-cmv-caption text-cmv-text-lo">{t("library.dosage.inherited")}</span>
      </div>
    );
  }

  const value = formatMetricValue(base, metric, customMetrics, i18n.language);
  return (
    <div className="flex items-center gap-cmv-xs pt-cmv-xs">
      <AdjustmentMarker level={marker} />
      <span className="text-cmv-caption text-cmv-text-lo">
        {/* Au niveau planifié, le défaut est ce que la SÉANCE a diffusé, pas la bibliothèque. */}
        {editing === AdjustmentLevel.SESSION
          ? t("library.session.defaultValue", { value })
          : t("library.dosage.sessionValue", { value })}
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
