import {
  type ExerciseBlocks,
  type ExerciseDto,
  type RichDocument,
  sameJson,
  toExerciseInput,
} from "@cmv/shared";
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

  /**
   * Ce qui est ENREGISTRÉ, sous la forme où le brouillon l'enverrait (#327). Le titre pré-rempli
   * en fait partie : repris de la recherche, il n'a pas été saisi ici et sa perte ne coûte rien.
   *
   * Remis à jour avec ce qui est PARTI, pas avec la réponse : celle-ci porte les ids définitifs
   * des images de la consigne, là où le brouillon garde leurs ids provisoires — l'écran se
   * croirait modifié juste après avoir tout enregistré.
   */
  const [saved, setSaved] = useState(() =>
    toExerciseInput(
      exercise ?? { title: initialTitle ?? "", tags: [], instructions: null, blocks: [] },
    ),
  );
  const input = toExerciseInput({ title, tags, instructions, blocks });
  // Un fichier ou un lien en attente n'est dans aucun champ : il compte à part.
  const isDirty = !sameJson(input, saved) || pendingFiles.length > 0 || pendingLinks.length > 0;

  const trimmedTitle = title.trim();

  /** L'exercice tel qu'enregistré : l'écran qui l'a ouvert depuis une séance l'y fait ajouter. */
  async function submit(): Promise<ExerciseDto> {
    const result = await save({
      exercise: current,
      input,
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
    // Seulement une fois TOUT passé : un envoi interrompu laisse l'écran modifié, et le coach
    // averti s'il part sans réessayer.
    setSaved(input);
    return result;
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
    /** L'écran montre autre chose que l'enregistré : le quitter perdrait la saisie (#327). */
    isDirty,
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
