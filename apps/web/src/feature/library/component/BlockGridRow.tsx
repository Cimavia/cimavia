import {
  type BlockMetric,
  type CustomMetric,
  type GridSlot,
  GridSlotKind,
  type MetricValue,
} from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { GridCell } from "@/feature/library/component/GridCell";
import type { useBlockRows } from "@/feature/library/hook/useBlockRows";
import { CMV_TABLE, CmvButton, CmvDragHandle } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

/**
 * L'en-tête commun des deux grilles : la colonne d'index, les colonnes de la grille (fournies par
 * l'appelant — menu de colonne ou simple libellé), puis celle des actions.
 *
 * En Séries, la colonne d'index s'intitule « Série » EN CLAIR (#520) : ses lignes sont les séries,
 * et c'est précisément ce que le coach ne voyait pas. Ailleurs l'intitulé reste réservé aux
 * lecteurs d'écran — un numéro de poste se passe de titre.
 */
export function BlockGridHead({
  isSeries,
  hasRows,
  children,
}: Readonly<{ isSeries: boolean; hasRows: boolean; children: ReactNode }>) {
  const { t } = useTranslation();
  return (
    <thead>
      <tr className={cn(CMV_TABLE.head, hasRows && CMV_TABLE.headBorder)}>
        <th className={cn("w-20", CMV_TABLE.headCell)} scope="col">
          {isSeries ? (
            <span className={CMV_TABLE.headLabel}>{t("library.builder.grid.setIndex")}</span>
          ) : (
            <span className="sr-only">{t("library.builder.grid.rowIndex")}</span>
          )}
        </th>
        {children}
        <th className={cn("w-10", CMV_TABLE.headCell)} scope="col">
          <span className="sr-only">{t("library.builder.grid.rowActions")}</span>
        </th>
      </tr>
    </thead>
  );
}

type BlockGridRowProps = {
  slot: GridSlot;
  metrics: readonly BlockMetric[];
  customMetrics: readonly CustomMetric[];
  rows: ReturnType<typeof useBlockRows>;
  /** L'écriture d'une cellule d'une ligne STOCKÉE — côté séance, c'est elle qui pose le marqueur. */
  onCellChange: (rowId: string, metricId: string, value: MetricValue) => void;
  /** Sous la cellule d'une ligne stockée : le marqueur d'ajustement, côté séance. */
  renderCellExtra?: (rowId: string, metric: BlockMetric) => ReactNode;
};

/**
 * Une ligne de la grille, quelle que soit sa nature : ligne, série, série fantôme ou ligne non
 * jouée.
 *
 * UN seul `<tr>` pour toutes, aux mêmes positions, et c'est voulu : une série fantôme qui se
 * matérialise garde sa clé (`useBlockRows`), mais React ne garde ses cellules — donc le focus du
 * coach qui tabule — que si l'arbre rendu reste le même. Deux composants, un par nature, et la
 * ligne était remontée à neuf sous le curseur.
 *
 * Une série FANTÔME montre la valeur qu'elle reprend, estompée, et d'où elle la reprend ; sur une
 * grille vide il n'y a rien à reprendre, et la cellule dit « — » plutôt qu'une valeur inventée
 * (règle dure n°5). Elle n'a ni poignée ni corbeille : c'est le nombre de séries qui la fait
 * exister, pas une ligne qu'on déplace ou qu'on retire.
 */
export function BlockGridRow({
  slot,
  metrics,
  customMetrics,
  rows,
  onCellChange,
  renderCellExtra,
}: Readonly<BlockGridRowProps>) {
  const { t } = useTranslation();
  const { index } = slot;
  const ghost = slot.kind === GridSlotKind.GHOST_SET;
  // La ligne STOCKÉE, ou `null` pour un fantôme ; et celle dont les valeurs s'affichent.
  const row = ghost ? null : slot.row;
  const shown = ghost ? (slot.source?.row ?? null) : slot.row;

  function write(metricId: string, value: MetricValue) {
    if (row == null) rows.materialize(index, metricId, value);
    else onCellChange(row.id, metricId, value);
  }

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
            <CmvDragHandle
              label={`${t("library.builder.grid.moveRow")} ${index + 1}`}
              {...rows.drag.handleProps(index)}
              onMove={(direction) => rows.moveRow(index, index + direction)}
            />
          )}
          <span className={cn(CMV_TABLE.index, isMuted(slot) && "opacity-60")}>{index + 1}</span>
          <RowNote slot={slot} />
        </div>
      </td>

      {metrics.map((metric) => (
        <td key={metric.id} className={CMV_TABLE.cell}>
          <GridCell
            metric={metric}
            customMetrics={customMetrics}
            value={shown?.values[metric.id] ?? null}
            ghost={isMuted(slot)}
            placeholder={ghost ? t("library.builder.grid.emptyValue") : undefined}
            onChange={(value) => write(metric.id, value)}
            onCommitLine={(value) => {
              if (row != null) rows.commitLine(index, row.id, metric.id, value);
            }}
          />
          {row == null ? null : renderCellExtra?.(row.id, metric)}
        </td>
      ))}

      <td className={CMV_TABLE.cell}>
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

/** Une série fantôme ou une ligne non jouée : ce que l'athlète jouera ne s'y écrit pas ici. */
function isMuted(slot: GridSlot): boolean {
  return slot.kind === GridSlotKind.GHOST_SET || slot.kind === GridSlotKind.UNPLAYED;
}

/** Ce que l'index seul ne dit pas : la série reprise, ou une ligne que personne ne jouera. */
function RowNote({ slot }: Readonly<{ slot: GridSlot }>) {
  const { t } = useTranslation();
  let note: string | null = null;
  if (slot.kind === GridSlotKind.UNPLAYED) note = t("library.builder.grid.unplayed");
  if (slot.kind === GridSlotKind.GHOST_SET && slot.source != null) {
    note = t("library.builder.grid.ghostOf", { index: slot.source.index + 1 });
  }
  if (note == null) return null;
  return <span className="whitespace-nowrap text-cmv-caption text-cmv-text-lo italic">{note}</span>;
}
