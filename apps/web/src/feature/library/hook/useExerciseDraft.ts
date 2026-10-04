import type { ExerciseBlocks, ExerciseDto, RichDocument } from "@cmv/shared";
import { useState } from "react";
import { useExercise } from "@/feature/library/hook/useExercises";
import { useInstructionMedia } from "@/feature/library/hook/useInstructionMedia";
import { type PendingFile, useSaveExercise } from "@/feature/library/hook/useSaveExercise";

/**
 * Tout l'état du constructeur, et le seul geste qui l'écrit. Extrait de l'écran pour que celui-ci
 * ne fasse que du rendu : mêlés, le formulaire, l'envoi des médias et la mise en page dépassaient
 * le seuil de complexité de la porte qualité.
 *
 * L'état naît de l'exercice chargé et n'y retourne pas : l'écran remonte le composant (par sa
 * `key`) quand l'URL change d'exercice.
 */
export function useExerciseDraft(exercise: ExerciseDto | null, initialTitle?: string) {
  const { save, isSaving, error, progress } = useSaveExercise();

  /**
   * L'exercice CRÉÉ par un enregistrement dont la suite a échoué : dès lors, le brouillon est une
   * édition, et un réessai met à jour au lieu de recréer (#302).
   *
   * Tenu ici plutôt qu'en naviguant vers `/library/exercises/$id` : changer d'URL remonterait le
   * constructeur, et avec lui les fichiers, liens et images encore en attente — précisément ce
   * que le coach veut réessayer d'envoyer. La requête ne sert qu'à montrer les documents déjà
   * rattachés, que la réponse de création ne peut pas porter.
   */
  const [created, setCreated] = useState<ExerciseDto | null>(null);
  const { data: refreshed } = useExercise(exercise == null ? created?.id : undefined);
  const current = exercise ?? refreshed ?? created;

  // L'exercice chargé l'emporte : `initialTitle` ne sert qu'à la création.
  const [title, setTitle] = useState(exercise?.title ?? initialTitle ?? "");
  const [tags, setTags] = useState<string[]>(exercise?.tags ?? []);
  const [instructions, setInstructions] = useState<RichDocument>(exercise?.instructions ?? []);
  const [blocks, setBlocks] = useState<ExerciseBlocks>(exercise?.blocks ?? []);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pendingLinks, setPendingLinks] = useState<string[]>([]);
  const media = useInstructionMedia(current?.documents ?? []);

  const trimmedTitle = title.trim();

  /** L'exercice tel qu'enregistré : l'écran qui l'a ouvert depuis une séance l'y fait ajouter. */
  async function submit(): Promise<ExerciseDto> {
    return save({
      exercise: current,
      input: {
        title: trimmedTitle,
        tags,
        // Document vide → `null` et non `[]` : « pas de consigne » est une absence, pas un
        // document sans bloc (règle nullable n°5).
        instructions: instructions.length === 0 ? null : instructions,
        blocks,
      },
      pendingFiles,
      pendingLinks,
      pendingImages: media.pending,
      sentImages: media.sent,
      onImageProgress: media.setProgress,
      onExerciseSaved: (saved) => {
        if (exercise == null) setCreated(saved);
      },
      onFileAttached: (pendingId) =>
        setPendingFiles((files) => files.filter((file) => file.id !== pendingId)),
      onLinkAttached: (url) => setPendingLinks((links) => withoutFirst(links, url)),
      onImageAttached: media.markSent,
    });
  }

  return {
    /** L'exercice édité — celui chargé, ou celui qu'un enregistrement interrompu a créé. */
    exercise: current,
    title,
    setTitle,
    trimmedTitle,
    tags,
    setTags,
    instructions,
    setInstructions,
    blocks,
    setBlocks,
    pendingFiles,
    setPendingFiles,
    pendingLinks,
    setPendingLinks,
    media,
    submit,
    isSaving,
    error,
    progress,
  };
}

// La première occurrence seulement : deux fois le même lien en attente, c'est deux rattachements.
function withoutFirst(links: readonly string[], url: string): string[] {
  // Sans branche « introuvable » : un `indexOf` à -1 ne désigne aucune position, et le filtre
  // rend alors la liste entière — le lien a pu être retiré pendant l'envoi.
  const index = links.indexOf(url);
  return links.filter((_, position) => position !== index);
}
