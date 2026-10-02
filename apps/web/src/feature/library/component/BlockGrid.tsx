import { type CustomMetric, type ExerciseBlock, metricUnitLabel, withCellValue } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { BlockGridHead, BlockGridRow } from "@/feature/library/component/BlockGridRow";
import { ColumnMenu } from "@/feature/library/component/ColumnMenu";
import { useBlockRows } from "@/feature/library/hook/useBlockRows";
import { CMV_TABLE, CmvButton } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type BlockGridProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  /**
   * Id de la colonne dont le menu est ouvert, POUR TOUTE LA PAGE. L'état vit chez
   * `StructureSection` et non ici : sinon chaque bloc garde le sien, et deux menus de deux blocs
   * différents s'ouvrent en même temps — ils se recouvrent, et le second masque le premier.
   */
  openMetricId: string | null;
  onOpenChange: (metricId: string | null) => void;
  onChange: (block: ExerciseBlock) => void;
};

/**
 * La grille de dosage d'un bloc : une colonne par métrique, une ligne par effort distinct — en
 * Séries, une ligne par SÉRIE, fantômes compris (#520).
 *
 * Une grille SANS LIGNE garde ses en-têtes — le coach voit ce qu'on va lui demander — et c'est un
 * état valide, pas une erreur.
 */
export function BlockGrid({
  block,
  customMetrics,
  openMetricId,
  onOpenChange,
  onChange,
}: Readonly<BlockGridProps>) {
  const { t } = useTranslation();
  const rows = useBlockRows(block, (next) => onChange({ ...block, rows: next }));

  // Une colonne repliée quitte la grille et rejoint le bandeau : elle n'y répéterait que la même
  // valeur autant de fois qu'il y a de lignes.
  const shown = block.metrics.filter((metric) => !metric.collapsed);

  return (
    <div className="flex flex-col gap-cmv-sm">
      {/* `overflow-x-auto` : au-delà de quatre ou cinq colonnes la grille dépasse, et c'est au
          tableau de défiler — jamais à la page. */}
      <div className={cn("overflow-x-auto", CMV_TABLE.frame)}>
        <table className={CMV_TABLE.table}>
          <BlockGridHead isSeries={rows.isSeries} hasRows={rows.slots.length > 0}>
            {shown.map((metric) => {
              const unit = metricUnitLabel(metric, customMetrics, t);
              return (
                <th key={metric.id} scope="col" className={CMV_TABLE.headCell}>
                  <ColumnMenu
                    block={block}
                    metric={metric}
                    customMetrics={customMetrics}
                    openMetricId={openMetricId}
                    onOpenChange={onOpenChange}
                    onChange={onChange}
                  />
                  {/* L'unité reste en casse normale : « kg » n'est pas un titre de colonne. */}
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
                onCellChange={(rowId, metricId, value) =>
                  onChange({ ...block, rows: withCellValue(block.rows, rowId, metricId, value) })
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-cmv-md">
        {/* En Séries, c'est le champ « Séries » du bandeau qui fixe le nombre de lignes. */}
        {rows.canAddRow ? (
          <CmvButton variant="secondary" onClick={rows.addRow} disabled={rows.isFull}>
            {t("library.builder.grid.addRow")}
          </CmvButton>
        ) : null}
        <span className="text-cmv-caption text-cmv-text-lo">
          {t(
            rows.isSeries
              ? "library.builder.grid.keyboardHintSeries"
              : "library.builder.grid.keyboardHint",
          )}
        </span>
      </div>
    </div>
  );
}
