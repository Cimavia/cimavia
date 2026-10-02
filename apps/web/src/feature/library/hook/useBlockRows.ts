import {
  BLOCK_MAX_ROWS,
  BlockType,
  type ExerciseBlock,
  type GridSlot,
  GridSlotKind,
  gridSlots,
  type MetricValue,
  required,
  withCellValue,
  withDuplicatedLastRow,
  withMaterializedSeries,
} from "@cmv/shared";
import { useRef } from "react";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";

type Rows = ExerciseBlock["rows"];

const newRowId = () => crypto.randomUUID();

/**
 * Les gestes sur les LIGNES d'une grille de dosage, communs au constructeur d'exercice et à celui
 * de séance : ce qui les distingue — le menu de colonne, le marqueur d'ajustement — vit dans chaque
 * grille, et le reste n'est écrit qu'ici.
 *
 * En Séries (#520), la grille montre une ligne par série ; celles qui n'ont pas de ligne propre
 * sont des FANTÔMES, que la saisie matérialise. Il n'y a alors plus de ligne à ajouter : c'est le
 * champ « Séries » du bandeau qui fixe combien la grille en montre.
 */
export function useBlockRows(block: ExerciseBlock, onRowsChange: (rows: Rows) => void) {
  const isSeries = block.structure.type === BlockType.SERIES;

  // Les identifiants RÉSERVÉS des fantômes, par rang. Une ligne qui se matérialise prend celui de
  // son fantôme : même clé React, donc même cellule à l'écran, et le focus ne saute pas quand le
  // coach tabule hors d'une cellule qu'il vient de remplir.
  const reserved = useRef(new Map<number, string>());
  function reservedId(index: number): string {
    const known = reserved.current.get(index);
    // Un identifiant déjà porté par une ligne (déplacée depuis) ne se réutilise pas : deux lignes
    // auraient la même clé.
    if (known != null && !block.rows.some((row) => row.id === known)) return known;
    const id = newRowId();
    reserved.current.set(index, id);
    return id;
  }

  /** La clé React d'un rang : la ligne stockée, ou l'identifiant réservé de son fantôme. */
  function keyOf(slot: GridSlot): string {
    return slot.kind === GridSlotKind.GHOST_SET ? reservedId(slot.index) : slot.row.id;
  }

  // L'ordre du tableau EST l'ordre affiché : déplacer l'élément suffit, rien à renuméroter.
  function moveRow(from: number, to: number) {
    if (to < 0 || to >= block.rows.length) return;
    const next = [...block.rows];
    next.splice(to, 0, ...next.splice(from, 1));
    onRowsChange(next);
  }

  const drag = useReorderDrag(moveRow);

  /** « Ajouter une ligne » DUPLIQUE la dernière : deux lignes se ressemblent presque toujours. */
  function addRow() {
    onRowsChange(withDuplicatedLastRow(block.rows, newRowId()));
  }

  /**
   * Entrée sur la DERNIÈRE ligne : la valeur validée et la nouvelle ligne partent en UNE écriture.
   * En deux, l'ajout — calculé sur les lignes d'avant la frappe — effaçait la valeur (#299).
   *
   * Ailleurs, et partout en Séries, Entrée ne fait que valider : on insérerait sinon des lignes au
   * milieu par accident, ou une ligne que personne ne jouerait au-delà de la dernière série.
   */
  function commitLine(index: number, rowId: string, metricId: string, value: MetricValue) {
    if (isSeries || index !== block.rows.length - 1) return;
    onRowsChange(
      withDuplicatedLastRow(withCellValue(block.rows, rowId, metricId, value), newRowId()),
    );
  }

  /**
   * Une valeur tapée dans une série FANTÔME : la série reçoit sa ligne — et les fantômes qui la
   * précèdent aussi, en copie de la dernière ligne, pour que la ligne n reste la série n.
   */
  function materialize(index: number, metricId: string, value: MetricValue) {
    const rows = withMaterializedSeries(block.rows, index, reservedId);
    const row = required(rows[index], "série matérialisée absente");
    onRowsChange(withCellValue(rows, row.id, metricId, value));
  }

  /**
   * Retirer une série détaillée fait remonter les suivantes : la dernière redevient un fantôme,
   * qui reprend la nouvelle dernière ligne. Les lignes sont un tableau, pas des cases numérotées.
   */
  function removeRow(rowId: string) {
    onRowsChange(block.rows.filter((row) => row.id !== rowId));
  }

  return {
    slots: gridSlots(block),
    isSeries,
    canAddRow: !isSeries,
    isFull: block.rows.length >= BLOCK_MAX_ROWS,
    keyOf,
    moveRow,
    drag,
    addRow,
    commitLine,
    materialize,
    removeRow,
  };
}
