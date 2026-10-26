import {
  type BlockGridSlot,
  BlockSlotKind,
  blockGridSlots,
  type GridRow,
  type MetricValue,
  movedItem,
  required,
  withCellValue,
  withMaterializedSeries,
} from "@cmv/shared";
import { useRef } from "react";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";

/**
 * Les gestes sur les lignes de la grille d'un exercice de bloc (#719) : une ligne par tour, celles
 * qui n'existent pas en fantôme de la dernière (`blockGridSlots`). Taper dans un fantôme lui donne
 * sa ligne ; il n'y a pas de ligne à ajouter — ce sont les tours du bloc qui en fixent le nombre.
 */
export function useGridRows(
  rows: readonly GridRow[],
  limit: number,
  onRowsChange: (rows: GridRow[]) => void,
) {
  // Les identifiants RÉSERVÉS des fantômes, par rang, comme l'ancienne grille (`useBlockRows`) :
  // une ligne qui se matérialise garde la clé React de son fantôme, et le focus ne saute pas.
  const reserved = useRef(new Map<number, string>());
  function reservedId(index: number): string {
    const known = reserved.current.get(index);
    if (known != null && !rows.some((row) => row.id === known)) return known;
    const id = crypto.randomUUID();
    reserved.current.set(index, id);
    return id;
  }

  function moveRow(from: number, to: number) {
    // Seules les lignes propres se déplacent : un fantôme n'est qu'un tour sans ligne.
    if (to < 0 || to >= rows.length) return;
    onRowsChange(movedItem(rows, from, to));
  }

  const drag = useReorderDrag(moveRow);

  /** Une valeur tapée : dans sa ligne, ou dans un fantôme qui reçoit la sienne (et ceux d'avant). */
  function write(slot: BlockGridSlot, metricId: string, value: MetricValue) {
    if (slot.kind !== BlockSlotKind.GHOST) {
      onRowsChange(withCellValue([...rows], slot.row.id, metricId, value));
      return;
    }
    const next = withMaterializedSeries([...rows], slot.index, reservedId);
    const row = required(next[slot.index], "tour matérialisé absent");
    onRowsChange(withCellValue(next, row.id, metricId, value));
  }

  return {
    slots: blockGridSlots(rows, limit),
    keyOf: (slot: BlockGridSlot) =>
      slot.kind === BlockSlotKind.GHOST ? reservedId(slot.index) : slot.row.id,
    drag,
    moveRow,
    write,
    removeRow: (rowId: string) => onRowsChange(rows.filter((row) => row.id !== rowId)),
  };
}
