import {
  BLOCK_MAX_ROWS,
  type CustomMetric,
  type ExerciseBlock,
  type MetricValue,
} from "@cmv/shared";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoReorderTwo, IoTrashOutline } from "react-icons/io5";
import { ColumnMenu } from "@/feature/library/component/ColumnMenu";
import { GridCell } from "@/feature/library/component/GridCell";
import { metricUnitLabel } from "@/feature/library/util/metric-label.util";
import { CmvButton } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type BlockGridProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
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
export function BlockGrid({ block, customMetrics, onChange }: Readonly<BlockGridProps>) {
  const { t } = useTranslation();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const isFull = block.rows.length >= BLOCK_MAX_ROWS;
  // Une colonne repliée quitte la grille et rejoint le bandeau : elle n'y répéterait que la
  // même valeur autant de fois qu'il y a de lignes.
  const shown = block.metrics.filter((metric) => !metric.collapsed);

  function setRows(rows: Row[]) {
    onChange({ ...block, rows });
  }

  /** « Ajouter une ligne » DUPLIQUE la dernière : deux séries se ressemblent presque toujours. */
  function addRow() {
    if (isFull) return;
    const last = block.rows.at(-1);
    setRows([...block.rows, { id: newRowId(), values: { ...(last?.values ?? {}) } }]);
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
  function moveRow(from: number, to: number) {
    if (to < 0 || to >= block.rows.length || from === to) return;
    const next = [...block.rows];
    const [moved] = next.splice(from, 1);
    if (moved == null) return;
    next.splice(to, 0, moved);
    setRows(next);
  }

  return (
    <div className="flex flex-col gap-cmv-sm">
      {/* `overflow-x-auto` : au-delà de quatre ou cinq colonnes la grille dépasse, et c'est au
          tableau de défiler — jamais à la page. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-cmv-border border-b">
              <th className="w-8 pb-cmv-xs text-cmv-caption text-cmv-text-lo" scope="col">
                <span className="sr-only">{t("library.builder.grid.rowIndex")}</span>
              </th>
              {shown.map((metric) => {
                const unit = metricUnitLabel(metric, customMetrics, t);
                return (
                  <th key={metric.id} scope="col" className="pb-cmv-xs pl-cmv-sm">
                    <ColumnMenu
                      block={block}
                      metric={metric}
                      customMetrics={customMetrics}
                      onChange={onChange}
                    />
                    {unit == null ? null : (
                      <span className="text-cmv-caption text-cmv-text-lo"> · {unit}</span>
                    )}
                  </th>
                );
              })}
              <th className="w-10 pb-cmv-xs" scope="col">
                <span className="sr-only">{t("library.builder.grid.rowActions")}</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {block.rows.map((row, index) => (
              <tr
                key={row.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIndex != null) moveRow(dragIndex, index);
                  setDragIndex(null);
                }}
                className={cn(dragIndex === index && "opacity-50")}
              >
                <td className="align-middle">
                  <DragHandle
                    label={t("library.builder.grid.moveRow")}
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => setDragIndex(null)}
                    onMove={(direction) => moveRow(index, index + direction)}
                    index={index}
                  />
                </td>

                {shown.map((metric) => (
                  <td key={metric.id} className="pl-cmv-xs">
                    <GridCell
                      metric={metric}
                      customMetrics={customMetrics}
                      value={row.values[metric.id] ?? null}
                      onChange={(value) => setValue(row.id, metric.id, value)}
                      // Entrée sur la DERNIÈRE ligne en crée une nouvelle ; ailleurs elle ne
                      // fait que valider, sinon on insérerait des lignes au milieu par accident.
                      onCommitLine={() => {
                        if (index === block.rows.length - 1) addRow();
                      }}
                    />
                  </td>
                ))}

                <td className="align-middle">
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

type DragHandleProps = {
  label: string;
  index: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (direction: -1 | 1) => void;
};

/**
 * Poignée de réordonnancement. Glisser est le geste attendu, mais il est INACCESSIBLE au clavier :
 * la poignée est donc un bouton focusable qui répond aussi aux flèches haut/bas. Deux gestes pour
 * une même intention, sans encombrer chaque ligne de deux boutons de plus.
 */
function DragHandle({ label, index, onDragStart, onDragEnd, onMove }: Readonly<DragHandleProps>) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onMove(event.key === "ArrowUp" ? -1 : 1);
  }

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      aria-label={`${label} ${index + 1}`}
      className="cursor-grab px-cmv-xs text-cmv-text-lo hover:text-cmv-text-mid"
    >
      <IoReorderTwo />
    </button>
  );
}
