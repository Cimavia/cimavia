import type { ExerciseBlocks, ExerciseDto, RichDocument } from "@cmv/shared";
import { useState } from "react";
import { useInstructionMedia } from "@/feature/library/hook/useInstructionMedia";
import { useSaveExercise } from "@/feature/library/hook/useSaveExercise";

/**
 * Tout l'état du constructeur, et le seul geste qui l'écrit. Extrait de l'écran pour que celui-ci
 * ne fasse que du rendu : mêlés, le formulaire, l'envoi des médias et la mise en page dépassaient
 * le seuil de complexité de la porte qualité.
 *
 * L'état naît de l'exercice chargé et n'y retourne pas : l'écran remonte le composant (par sa
 * `key`) quand l'URL change d'exercice.
 */
export function useExerciseDraft(exercise: ExerciseDto | null, initialTitle?: string) {
  const { save, isSaving, error } = useSaveExercise();

  // L'exercice chargé l'emporte : `initialTitle` ne sert qu'à la création.
  const [title, setTitle] = useState(exercise?.title ?? initialTitle ?? "");
  const [tags, setTags] = useState<string[]>(exercise?.tags ?? []);
  const [instructions, setInstructions] = useState<RichDocument>(exercise?.instructions ?? []);
  const [blocks, setBlocks] = useState<ExerciseBlocks>(exercise?.blocks ?? []);
  const media = useInstructionMedia(exercise?.documents ?? []);

  const trimmedTitle = title.trim();

  async function submit() {
    await save({
      exercise,
      input: {
        title: trimmedTitle,
        tags,
        // Document vide → `null` et non `[]` : « pas de consigne » est une absence, pas un
        // document sans bloc (règle nullable n°5).
        instructions: instructions.length === 0 ? null : instructions,
        blocks,
      },
      pendingFiles: [],
      pendingLinks: [],
      pendingImages: media.pending,
      onImageProgress: media.setProgress,
    });
  }

  return {
    title,
    setTitle,
    trimmedTitle,
    tags,
    setTags,
    instructions,
    setInstructions,
    blocks,
    setBlocks,
    media,
    submit,
    isSaving,
    error,
  };
}
