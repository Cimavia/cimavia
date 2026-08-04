import type { ExerciseCategory, ExerciseDto, ScheduledSessionDto } from "@cmv/shared";
import { useState } from "react";

/**
 * Ligne de composition en cours d'édition. `key` est locale et stable : un même exercice peut
 * figurer deux fois dans une séance, l'id source ne suffit donc pas à l'identifier.
 */
export type EditorItem = {
  key: string;
  sourceExerciseId: string | null;
  title: string;
  description: string | null;
  category: ExerciseCategory;
  prescription: string;
};

function toEditorItems(session: ScheduledSessionDto | null): EditorItem[] {
  if (session == null) return [];
  return session.exercises.map((exercise) => ({
    key: exercise.id,
    sourceExerciseId: exercise.sourceExerciseId,
    title: exercise.title,
    description: exercise.description,
    category: exercise.category,
    prescription: exercise.prescription ?? "",
  }));
}

/**
 * La composition d'une séance planifiée en cours d'édition : la liste et les quatre gestes qui la
 * modifient. Un exercice ajouté ici est une COPIE (snapshot titre/description/catégorie) — la
 * bibliothèque ne bouge jamais, et supprimer l'exercice source plus tard ne casse rien (CDC §5.4).
 */
export function useSessionComposition(session: ScheduledSessionDto | null) {
  const [items, setItems] = useState<EditorItem[]>(() => toEditorItems(session));

  function addExercise(exercise: ExerciseDto) {
    setItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        sourceExerciseId: exercise.id,
        title: exercise.title,
        description: exercise.description,
        category: exercise.category,
        prescription: "",
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  // Déplace une ligne d'un cran ; la position finale = l'ordre du tableau (l'API la déduit).
  function moveItem(index: number, direction: -1 | 1) {
    setItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved == null) return current;
      next.splice(target, 0, moved);
      return next;
    });
  }

  function setPrescription(key: string, value: string) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, prescription: value } : item)),
    );
  }

  return { items, addExercise, removeItem, moveItem, setPrescription };
}
