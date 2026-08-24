import type { ExerciseDto, ScheduledSessionDto } from "@cmv/shared";
import { type CompositionRow, useComposition } from "@/feature/library/hook/useComposition";

/**
 * Ligne de composition d'une séance PLANIFIÉE. Elle porte un snapshot (titre, description,
 * catégorie) et `sourceExerciseId` **nullable** : la séance planifiée est une copie autonome, pas
 * une référence — supprimer l'exercice d'origine dans la bibliothèque ne doit jamais casser un
 * cycle diffusé (tranché en P3, cf. dette-technique.md).
 */
export type EditorItem = CompositionRow & {
  sourceExerciseId: string | null;
  description: string | null;
};

function toEditorItems(session: ScheduledSessionDto | null): EditorItem[] {
  if (session == null) return [];
  return session.exercises.map((exercise) => ({
    key: exercise.id,
    sourceExerciseId: exercise.sourceExerciseId,
    title: exercise.title,
    description: exercise.description,
    tags: exercise.tags,
    prescription: exercise.prescription ?? "",
  }));
}

// L'exercice piocché devient une COPIE : on garde son id en trace, pas en dépendance.
function toEditorRow(exercise: ExerciseDto): Omit<EditorItem, "key"> {
  return {
    sourceExerciseId: exercise.id,
    title: exercise.title,
    description: exercise.description,
    tags: exercise.tags,
    prescription: "",
  };
}

// La composition d'une séance planifiée, sur le socle partagé avec le builder de bibliothèque.
export function useSessionComposition(session: ScheduledSessionDto | null) {
  return useComposition<EditorItem>(() => toEditorItems(session), toEditorRow);
}
