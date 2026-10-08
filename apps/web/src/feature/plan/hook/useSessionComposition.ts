import {
  AdjustmentLevel,
  type Adjustments,
  adjustCell,
  adjustmentCount,
  adjustRows,
  adjustStructure,
  type DosageEditable,
  type DosageScope,
  type ExerciseBlock,
  type ExerciseDto,
  type MetricValue,
  resetAllAdjustments,
  revertCell,
  revertStructureField,
  type ScheduledSessionDto,
  type ScheduledSessionExerciseInput,
} from "@cmv/shared";
import { type CompositionRow, useComposition } from "@/feature/plan/hook/useComposition";

type ScheduledExercise = ScheduledSessionDto["exercises"][number];

/**
 * Ligne de composition d'une séance PLANIFIÉE. Elle porte un snapshot (titre, description,
 * catégorie) et `sourceExerciseId` **nullable** : la séance planifiée est une copie autonome, pas
 * une référence — supprimer l'exercice d'origine dans la bibliothèque ne doit jamais casser un
 * cycle diffusé (tranché en P3, cf. docs/dette/planifications.md).
 *
 * Son dosage s'édite au niveau SÉANCE PLANIFIÉE (#518) : `blocks`, `baseline` et `adjustments`
 * comme au niveau séance, plus `baselineAdjustments`, les marqueurs reçus de la séance-type.
 */
export type EditorItem = CompositionRow &
  DosageEditable & {
    /** L'exercice diffusé d'où vient cette ligne, ou `null` pour une ligne ajoutée dans le panneau. */
    id: string | null;
    sourceExerciseId: string | null;
    description: string | null;
    /** Lu seulement : l'entrée ne le porte pas, et le serveur ne le réécrit jamais. */
    baselineAdjustments: Adjustments;
    /**
     * Le SNAPSHOT que ce panneau ne modifie pas — consigne, métriques maison.
     *
     * Il est transporté ici uniquement pour être RENVOYÉ tel quel : l'enregistrement est un
     * replace-all, et tout ce que le client n'émet pas est effacé en base.
     */
    snapshot: {
      instructions: ScheduledExercise["instructions"];
      /** `null` = à calculer par le serveur, qui seul connaît les métriques maison du coach. */
      customMetrics: ScheduledExercise["customMetrics"] | null;
    };
  };

function toEditorItems(session: ScheduledSessionDto | null): EditorItem[] {
  if (session == null) return [];
  return session.exercises.map((exercise) => ({
    key: exercise.id,
    id: exercise.id,
    sourceExerciseId: exercise.sourceExerciseId,
    title: exercise.title,
    description: exercise.description,
    tags: exercise.tags,
    note: exercise.note ?? "",
    blocks: exercise.blocks,
    baseline: exercise.baseline,
    adjustments: exercise.adjustments,
    baselineAdjustments: exercise.baselineAdjustments,
    snapshot: {
      instructions: exercise.instructions,
      customMetrics: exercise.customMetrics,
    },
  }));
}

// L'exercice piocché devient une COPIE : on garde son id en trace, pas en dépendance.
function toEditorRow(exercise: ExerciseDto): Omit<EditorItem, "key"> {
  return {
    // Pas encore d'exercice diffusé derrière : c'est le serveur qui en créera un.
    id: null,
    sourceExerciseId: exercise.id,
    title: exercise.title,
    description: exercise.description,
    tags: exercise.tags,
    note: "",
    // Le dosage vient de la BIBLIOTHÈQUE, figé à l'enregistrement comme à la diffusion. Aucune
    // référence côté écran : rien à quoi revenir, donc aucun marqueur — le serveur posera ce
    // dosage même en référence, et la ligne n'aura été ajustée pour personne.
    blocks: exercise.blocks,
    baseline: [],
    adjustments: [],
    baselineAdjustments: [],
    snapshot: {
      instructions: exercise.instructions,
      // `ExerciseDto` ne porte pas les définitions maison : le serveur les résout depuis les
      // métriques du coach, comme il le fait à la diffusion.
      customMetrics: null,
    },
  };
}

/**
 * Une ligne telle que l'enregistrement l'envoie — replace-all : ce qu'on envoie EST la nouvelle
 * vérité. D'où le renvoi INTÉGRAL du snapshot : omettre un champ ne le laisse pas tel quel, ça
 * l'efface, et une séance diffusée qui perd ses blocs ne dit plus à l'athlète quoi faire.
 *
 * `id` rattache la ligne à l'exercice diffusé qu'elle remplace : c'est ce qui permet au serveur de
 * reporter le SUIVI de l'athlète, et de vérifier le verrou de structure contre sa référence.
 * Ni `baseline` ni `baselineAdjustments` ne partent : le serveur les garde, et refuse qu'on les
 * lui envoie.
 */
export function toExerciseInput(item: EditorItem): ScheduledSessionExerciseInput {
  return {
    ...(item.id == null ? {} : { id: item.id }),
    sourceExerciseId: item.sourceExerciseId,
    title: item.title,
    description: item.description,
    tags: item.tags,
    note: item.note.trim() || null,
    instructions: item.snapshot.instructions,
    blocks: item.blocks,
    ...(item.snapshot.customMetrics == null ? {} : { customMetrics: item.snapshot.customMetrics }),
    adjustments: item.adjustments,
  };
}

/** Le niveau d'une ligne : la séance planifiée, avec pour référence ce que la séance a diffusé. */
const scopeOf = (item: EditorItem): DosageScope => ({
  level: AdjustmentLevel.SCHEDULED,
  reference: item.baselineAdjustments,
});

/** Combien de valeurs d'une ligne sont ajustées pour l'athlète — ce que porte son carré. */
export const scheduledAdjustmentCount = (item: EditorItem): number =>
  adjustmentCount(item.adjustments, AdjustmentLevel.SCHEDULED);

/**
 * La composition d'une séance planifiée, sur le socle de `useComposition`, et le dosage de chaque
 * ligne au niveau SÉANCE PLANIFIÉE : les mêmes gestes que le constructeur de séance, issus de
 * `@cmv/shared` et paramétrés par le niveau — jamais un modèle à part (#518).
 */
export function useSessionComposition(session: ScheduledSessionDto | null) {
  const composition = useComposition<EditorItem>(() => toEditorItems(session), toEditorRow);
  const { updateItem } = composition;

  function scoped(key: string, change: (item: EditorItem, scope: DosageScope) => EditorItem) {
    updateItem(key, (item) => change(item, scopeOf(item)));
  }

  const dosage = {
    setCell: (key: string, blockId: string, rowId: string, metricId: string, value: MetricValue) =>
      scoped(key, (item, scope) => adjustCell(item, scope, { blockId, rowId, metricId }, value)),
    setStructure: (key: string, blockId: string, structure: ExerciseBlock["structure"]) =>
      scoped(key, (item, scope) => adjustStructure(item, scope, blockId, structure)),
    setRows: (key: string, blockId: string, rows: ExerciseBlock["rows"]) =>
      updateItem(key, (item) => adjustRows(item, blockId, rows)),
    revertCell: (key: string, blockId: string, rowId: string, metricId: string) =>
      scoped(key, (item, scope) => revertCell(item, scope, { blockId, rowId, metricId })),
    revertStructureField: (key: string, blockId: string, field: string) =>
      scoped(key, (item, scope) => revertStructureField(item, scope, blockId, field)),
    /** « Tout réinitialiser » : ce que la séance a diffusé, valeurs ET marqueurs reçus. */
    resetAll: (key: string) => scoped(key, resetAllAdjustments),
  };

  /** Les exercices ajustés pour l'athlète — le « N ajusté(s) pour Léa » de l'en-tête. */
  const adjustedCount = composition.items.filter(
    (item) => scheduledAdjustmentCount(item) > 0,
  ).length;

  return { ...composition, dosage, adjustedCount };
}

export type ScheduledDosageGestures = ReturnType<typeof useSessionComposition>["dosage"];
