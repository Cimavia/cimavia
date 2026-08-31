import {
  AdjustmentLevel,
  type Adjustments,
  cellPath,
  clearAdjustment,
  type ExerciseBlocks,
  type ExerciseDto,
  markAdjusted,
  resetRow,
  resetToBaseline,
  type SessionDto,
  structurePath,
} from "@cmv/shared";
import { useState } from "react";
import { useSaveSession } from "@/feature/library/hook/useSessions";

/**
 * Une ligne de composition en cours d'édition. `key` est locale et stable : un même exercice peut
 * figurer deux fois dans une séance, l'id de l'exercice ne suffit donc pas à identifier la ligne.
 *
 * `id` est celui de la ligne DÉJÀ enregistrée, s'il existe. C'est lui qui permet au serveur de
 * retrouver la référence de dosage à travers le remplace-all.
 */
export type CompositionItem = {
  key: string;
  id?: string;
  exerciseId: string;
  title: string;
  tags: string[];
  note: string;
  blocks: ExerciseBlocks;
  baseline: ExerciseBlocks;
  adjustments: Adjustments;
};

const fromSession = (session: SessionDto | null): CompositionItem[] =>
  (session?.exercises ?? []).map((composed) => ({
    key: composed.id,
    id: composed.id,
    exerciseId: composed.exerciseId,
    title: composed.title,
    tags: composed.tags,
    note: composed.note ?? "",
    blocks: composed.blocks,
    baseline: composed.baseline,
    adjustments: composed.adjustments,
  }));

/**
 * Toute la composition d'une séance et les gestes qui la modifient.
 *
 * Les trois gestes de retour en arrière — revenir au défaut sur une ligne, tout réinitialiser,
 * recharger — sont écrits avec les fonctions pures de `@cmv/shared`. Deux d'entre eux se calculent
 * ici ; seul le rechargement passe par le serveur, parce qu'il déplace la référence.
 */
export function useSessionDraft(session: SessionDto | null) {
  const { save, isSaving, error } = useSaveSession();

  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [items, setItems] = useState<CompositionItem[]>(() => fromSession(session));

  const trimmedTitle = title.trim();

  function replace(key: string, change: (item: CompositionItem) => CompositionItem) {
    setItems((current) => current.map((item) => (item.key === key ? change(item) : item)));
  }

  function addExercise(exercise: ExerciseDto) {
    setItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        exerciseId: exercise.id,
        title: exercise.title,
        tags: exercise.tags,
        note: "",
        // La copie à l'AJOUT : la séance est indépendante dès cet instant, et le serveur posera
        // la même chose en référence.
        blocks: exercise.blocks,
        baseline: exercise.blocks,
        adjustments: [],
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function moveItem(from: number, to: number) {
    setItems((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved == null) return current;
      next.splice(to, 0, moved);
      return next;
    });
  }

  /** Écrit une valeur de grille ET pose son marqueur : les deux vont toujours ensemble. */
  function setCellValue(
    key: string,
    blockId: string,
    rowId: string,
    metricId: string,
    value: unknown,
  ) {
    replace(key, (item) => ({
      ...item,
      blocks: item.blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              rows: block.rows.map((row) =>
                row.id === rowId
                  ? { ...row, values: { ...row.values, [metricId]: value as never } }
                  : row,
              ),
            }
          : block,
      ),
      // Une ligne AJOUTÉE dans la séance n'existe pas dans la référence : sa valeur ne s'écarte
      // d'aucun défaut, donc aucun marqueur — et « Revenir au défaut » n'aurait rien à faire.
      adjustments: hasBaselineRow(item.baseline, blockId, rowId)
        ? markAdjusted(
            item.adjustments,
            cellPath(blockId, rowId, metricId),
            AdjustmentLevel.SESSION,
          )
        : item.adjustments,
    }));
  }

  /**
   * Un paramètre de bandeau — « 4 séries », « repos 2'30 ».
   *
   * Marqué CHAMP PAR CHAMP, en comparant à la référence : marquer « le bandeau » en bloc rendrait
   * « Revenir au défaut » incapable de dire lequel des paramètres il annule, et un retour manuel à
   * la valeur d'origine ne retirerait jamais le marqueur.
   */
  function setStructure(
    key: string,
    blockId: string,
    structure: ExerciseBlocks[number]["structure"],
  ) {
    replace(key, (item) => {
      const base = item.baseline.find((block) => block.id === blockId)?.structure;
      const adjustments = structureFields(structure).reduce((current, field) => {
        const path = structurePath(blockId, field);
        const differs = base == null || readField(base, field) !== readField(structure, field);
        return differs
          ? markAdjusted(current, path, AdjustmentLevel.SESSION)
          : clearAdjustment(current, path);
      }, item.adjustments);

      return {
        ...item,
        blocks: item.blocks.map((block) =>
          block.id === blockId ? { ...block, structure } : block,
        ),
        adjustments,
      };
    });
  }

  /** « Revenir au défaut » sur un paramètre de bandeau. */
  function revertStructureField(key: string, blockId: string, field: string) {
    replace(key, (item) => {
      const base = item.baseline.find((block) => block.id === blockId)?.structure;
      if (base == null) return item;
      return {
        ...item,
        blocks: item.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                structure: { ...block.structure, [field]: readField(base, field) } as never,
              }
            : block,
        ),
        adjustments: clearAdjustment(item.adjustments, structurePath(blockId, field)),
      };
    });
  }

  function setRows(key: string, blockId: string, rows: ExerciseBlocks[number]["rows"]) {
    replace(key, (item) => ({
      ...item,
      blocks: item.blocks.map((block) => (block.id === blockId ? { ...block, rows } : block)),
    }));
  }

  function revertRow(key: string, blockId: string, rowId: string) {
    replace(key, (item) => {
      const next = resetRow(item.blocks, item.baseline, item.adjustments, blockId, rowId);
      return { ...item, ...next };
    });
  }

  function revertCell(key: string, blockId: string, rowId: string, metricId: string) {
    replace(key, (item) => {
      const base = item.baseline
        .find((block) => block.id === blockId)
        ?.rows.find((row) => row.id === rowId);
      if (base == null) return item;
      return {
        ...item,
        blocks: item.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                rows: block.rows.map((row) =>
                  row.id === rowId
                    ? {
                        ...row,
                        values: { ...row.values, [metricId]: base.values[metricId] ?? null },
                      }
                    : row,
                ),
              }
            : block,
        ),
        adjustments: clearAdjustment(item.adjustments, cellPath(blockId, rowId, metricId)),
      };
    });
  }

  /** « Tout réinitialiser » : retour aux valeurs copiées à l'ajout, la référence ne bouge pas. */
  function resetItem(key: string) {
    replace(key, (item) => ({ ...item, ...resetToBaseline(item.baseline) }));
  }

  async function submit() {
    await save({
      session,
      input: {
        title: trimmedTitle,
        notes: notes.trim() === "" ? null : notes.trim(),
        exercises: items.map((item) => ({
          ...(item.id == null ? {} : { id: item.id }),
          exerciseId: item.exerciseId,
          note: item.note.trim() === "" ? null : item.note.trim(),
          blocks: item.blocks,
          adjustments: item.adjustments,
        })),
      },
    });
  }

  /**
   * Reprend une ligne après un rechargement serveur. Sans ça la réponse arrive et le cache est
   * invalidé, mais l'écran continue d'afficher son état local : le coach voit la confirmation
   * disparaître et rien changer.
   */
  function applyReloaded(reloaded: SessionDto) {
    setItems((current) =>
      current.map((item) => {
        const fresh = reloaded.exercises.find((composed) => composed.id === item.id);
        return fresh == null
          ? item
          : {
              ...item,
              blocks: fresh.blocks,
              baseline: fresh.baseline,
              adjustments: fresh.adjustments,
            };
      }),
    );
  }

  return {
    title,
    setTitle,
    trimmedTitle,
    notes,
    setNotes,
    items,
    setItems,
    addExercise,
    removeItem,
    moveItem,
    setCellValue,
    setStructure,
    revertStructureField,
    applyReloaded,
    setRows,
    revertRow,
    revertCell,
    resetItem,
    submit,
    isSaving,
    error,
  };
}

/** Les champs surchargeables d'un bandeau. `type` n'en est pas un : il est verrouillé. */
function structureFields(structure: ExerciseBlocks[number]["structure"]): string[] {
  return Object.keys(structure).filter((field) => field !== "type");
}

function readField(structure: ExerciseBlocks[number]["structure"], field: string): unknown {
  return (structure as unknown as Record<string, unknown>)[field];
}

function hasBaselineRow(baseline: ExerciseBlocks, blockId: string, rowId: string): boolean {
  return (
    baseline.find((block) => block.id === blockId)?.rows.some((row) => row.id === rowId) ?? false
  );
}
