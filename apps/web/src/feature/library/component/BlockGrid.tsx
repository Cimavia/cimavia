import {
  BLOCK_MAX_ROWS,
  type CustomMetric,
  type ExerciseBlock,
  type MetricValue,
  metricUnitLabel,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { ColumnMenu } from "@/feature/library/component/ColumnMenu";
import { GridCell } from "@/feature/library/component/GridCell";
import { CMV_TABLE, CmvButton, CmvDragHandle } from "@/shared/component";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
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

type Row = ExerciseBlock["rows"][number];

const newRowId = () => crypto.randomUUID();

/**
 * La grille de dosage d'un bloc : une colonne par métrique, une ligne par effort distinct.
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

  const isFull = block.rows.length >= BLOCK_MAX_ROWS;
  // Une colonne repliée quitte la grille et rejoint le bandeau : elle n'y répéterait que la même
  // valeur autant de fois qu'il y a de lignes.
  const shown = block.metrics.filter((metric) => !metric.collapsed);

  function setRows(rows: Row[]) {
    onChange({ ...block, rows });
  }

  /** « Ajouter une ligne » DUPLIQUE la dernière : deux séries se ressemblent presque toujours. */
  function addRow() {
    if (isFull) return;
    const last = block.rows.at(-1);
    setRows([...block.rows, { id: newRowId(), values: { ...last?.values } }]);
  }

  function setValue(rowId: string, metricId: string, value: MetricValue) {
    setRows(
      block.rows.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [metricId]: value } } : row,
      ),
    );
  }

  function removeRow(rowId: string) {
    setRows(block.rows.filter((row) => row.id !== rowId));
  }

  // L'ordre du tableau EST l'ordre affiché : déplacer l'élément suffit, rien à renuméroter.
  function moveRow(fromIndex: number, to: number) {
    if (to < 0 || to >= block.rows.length || fromIndex === to) return;
    const next = [...block.rows];
    const [moved] = next.splice(fromIndex, 1);
    if (moved == null) return;
    next.splice(to, 0, moved);
    setRows(next);
  }

  const drag = useReorderDrag(moveRow);

  return (
    <div className="flex flex-col gap-cmv-sm">
      {/* `overflow-x-auto` : au-delà de quatre ou cinq colonnes la grille dépasse, et c'est au
          tableau de défiler — jamais à la page. */}
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
                      onChange={(value) => setValue(row.id, metric.id, value)}
                      // Entrée sur la DERNIÈRE ligne en crée une nouvelle ; ailleurs elle ne fait
                      // que valider, sinon on insérerait des lignes au milieu par accident.
                      onCommitLine={() => {
                        if (index === block.rows.length - 1) addRow();
                      }}
                    />
                  </td>
                ))}

                <td className={CMV_TABLE.cell}>
                  <CmvButton
                    variant="ghost"
                    title={t("library.builder.grid.removeRow")}
                    onClick={() => removeRow(row.id)}
                  >
                    <IoTrashOutline />
                  </CmvButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-cmv-md">
        <CmvButton variant="secondary" onClick={addRow} disabled={isFull}>
          {t("library.builder.grid.addRow")}
        </CmvButton>
        <span className="text-cmv-caption text-cmv-text-lo">
          {t("library.builder.grid.keyboardHint")}
        </span>
      </div>
    </div>
  );
}
