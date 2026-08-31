import type { ExerciseDto, ScheduledSessionDto } from "@cmv/shared";
import { type CompositionRow, useComposition } from "@/feature/library/hook/useComposition";

/**
 * Ligne de composition d'une séance PLANIFIÉE. Elle porte un snapshot (titre, description,
 * catégorie) et `sourceExerciseId` **nullable** : la séance planifiée est une copie autonome, pas
 * une référence — supprimer l'exercice d'origine dans la bibliothèque ne doit jamais casser un
 * cycle diffusé (tranché en P3, cf. dette-technique.md).
 */
export type EditorItem = CompositionRow & {
  /** L'exercice diffusé d'où vient cette ligne, ou `null` pour une ligne ajoutée dans le panneau. */
  id: string | null;
  sourceExerciseId: string | null;
  description: string | null;
  /**
   * Le SNAPSHOT que ce panneau ne modifie pas — consigne, dosage, métriques maison, ajustements.
   *
   * Il est transporté ici uniquement pour être RENVOYÉ tel quel : l'enregistrement est un
   * replace-all, et tout ce que le client n'émet pas est effacé en base. Ce panneau réordonne et
   * annote ; il n'a aucune raison de détruire ce que la diffusion a figé.
   */
  snapshot: {
    instructions: ScheduledSessionDto["exercises"][number]["instructions"];
    blocks: ScheduledSessionDto["exercises"][number]["blocks"];
    /** `null` = à calculer par le serveur, qui seul connaît les métriques maison du coach. */
    customMetrics: ScheduledSessionDto["exercises"][number]["customMetrics"] | null;
    adjustments: ScheduledSessionDto["exercises"][number]["adjustments"];
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
    snapshot: {
      instructions: exercise.instructions,
      blocks: exercise.blocks,
      customMetrics: exercise.customMetrics,
      adjustments: exercise.adjustments,
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
    // La consigne et le dosage viennent de la BIBLIOTHÈQUE, pas d'un snapshot existant : ils sont
    // figés au moment de l'enregistrement, comme à la diffusion.
    snapshot: {
      instructions: exercise.instructions,
      blocks: exercise.blocks,
      // `ExerciseDto` ne porte pas les définitions maison : le serveur les résout depuis les
      // métriques du coach, comme il le fait à la diffusion.
      customMetrics: null,
      adjustments: [],
    },
  };
}

// La composition d'une séance planifiée, sur le socle partagé avec le builder de bibliothèque.
export function useSessionComposition(session: ScheduledSessionDto | null) {
  return useComposition<EditorItem>(() => toEditorItems(session), toEditorRow);
}
