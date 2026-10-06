import {
  type CreateExerciseInput,
  type DocumentMimeType,
  DocumentType,
  DocumentUsage,
  type ExerciseDto,
} from "@cmv/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  attachDocument,
  createExercise,
  deleteDocument,
  exerciseKeys,
  requestUploadUrl,
  updateExercise,
} from "@/feature/library/api";
import type { PendingImage } from "@/feature/library/hook/useInstructionMedia";
import {
  hasPendingImages,
  withResolvedImages,
} from "@/feature/library/util/instruction-media.util";
import { uploadToSignedUrl } from "@/shared/lib/upload";

// Fichier sélectionné mais pas encore envoyé (l'upload n'a lieu qu'à l'enregistrement, car
// les documents se rattachent à un exercice qui doit d'abord exister).
// `mimeType` porte le type DÉJÀ validé (File.type n'est qu'une string) : le compilateur
// garantit qu'aucun fichier non autorisé n'atteint l'API.
export type PendingFile = { id: string; file: File; mimeType: DocumentMimeType };

type SaveExerciseArgs = {
  // null = création ; sinon édition de cet exercice.
  exercise: ExerciseDto | null;
  input: CreateExerciseInput;
  pendingFiles: PendingFile[];
  pendingLinks: string[];
  /** Images posées dans la consigne et pas encore envoyées. */
  pendingImages?: readonly PendingImage[];
  /** Id définitif des images envoyées par un essai précédent, par id provisoire. */
  sentImages?: ReadonlyMap<string, string>;
  /** Remonte la progression d'envoi d'une image au magasin, qui l'affiche dans l'éditeur. */
  onImageProgress?: (mediaId: string, percent: number) => void;
  /**
   * Chaque temps réussi remonte au brouillon AU MOMENT où il réussit, pas à la fin : si la suite
   * échoue, le réessai doit mettre à jour l'exercice créé et ne renvoyer que ce qui manque. Sans
   * ça, il recréait l'exercice et rattachait une seconde fois chaque pièce jointe (#302).
   */
  onExerciseSaved?: (saved: ExerciseDto) => void;
  onFileAttached?: (pendingId: string) => void;
  onLinkAttached?: (url: string) => void;
  onImageAttached?: (mediaId: string, documentId: string) => void;
};

export function useSaveExercise() {
  const queryClient = useQueryClient();
  // Progression d'upload par fichier en attente (0–100).
  const [progress, setProgress] = useState<Record<string, number>>({});

  const mutation = useMutation({
    mutationFn: async ({
      exercise,
      input,
      pendingFiles,
      pendingLinks,
      pendingImages = [],
      sentImages = new Map(),
      onImageProgress,
      onExerciseSaved,
      onFileAttached,
      onLinkAttached,
      onImageAttached,
    }: SaveExerciseArgs) => {
      /**
       * Trois temps, et l'ordre n'est pas négociable : un document ne se rattache qu'à un exercice
       * qui EXISTE, or le coach pose ses images avant d'enregistrer.
       *
       *  1. écrire l'exercice SANS les images en attente — leurs ids provisoires ne désignent
       *     encore rien, et les écrire produirait des références mortes si l'envoi échouait.
       *     Celles qu'un essai précédent a envoyées y sont, elles, sous leur id définitif ;
       *  2. envoyer chaque image et la rattacher, ce qui lui donne son id définitif ;
       *  3. réécrire la consigne avec les vrais ids.
       *
       * Si le temps 2 échoue, l'exercice existe avec son texte et sans ses images : dégradé, mais
       * cohérent — et le formulaire, qui a appris à chaque temps réussi ce qui est déjà passé, ne
       * réessaie que le reste.
       */
      const instructions = input.instructions ?? null;
      const firstPass =
        instructions == null
          ? input
          : { ...input, instructions: nullIfEmpty(withResolvedImages(instructions, sentImages)) };

      const saved =
        exercise == null
          ? await createExercise(firstPass)
          : await updateExercise(exercise.id, firstPass);
      onExerciseSaved?.(saved);

      // Envois séquentiels : progression lisible et pas de rafale vers l'object storage.
      for (const pending of pendingFiles) {
        const { uploadUrl, storagePath } = await requestUploadUrl(saved.id, {
          fileName: pending.file.name,
          mimeType: pending.mimeType,
          size: pending.file.size,
        });
        await uploadToSignedUrl(uploadUrl, pending.file, (percent) => {
          setProgress((current) => ({ ...current, [pending.id]: percent }));
        });
        await attachDocument(saved.id, {
          type: DocumentType.FILE,
          storagePath,
          fileName: pending.file.name,
          mimeType: pending.mimeType,
          // Redite du ticket : l'API la confronte à ce que le storage a reçu (#317).
          size: pending.file.size,
        });
        onFileAttached?.(pending.id);
      }

      for (const url of pendingLinks) {
        await attachDocument(saved.id, { type: DocumentType.LINK, url });
        onLinkAttached?.(url);
      }

      // Rien à envoyer : les images déjà envoyées ont été écrites résolues au temps 1.
      if (instructions == null || pendingImages.length === 0 || !hasPendingImages(instructions)) {
        return saved;
      }

      const idByPendingId = new Map(sentImages);
      for (const image of pendingImages) {
        const { uploadUrl, storagePath } = await requestUploadUrl(saved.id, {
          fileName: image.file.name,
          mimeType: image.mimeType,
          size: image.file.size,
        });
        await uploadToSignedUrl(uploadUrl, image.file, (percent) =>
          onImageProgress?.(image.mediaId, percent),
        );
        const attached = await attachDocument(saved.id, {
          type: DocumentType.FILE,
          storagePath,
          fileName: image.file.name,
          mimeType: image.mimeType,
          size: image.file.size,
          // Ce qui l'exclut de la liste des pièces jointes : elle est DANS la consigne.
          usage: DocumentUsage.INSTRUCTION,
        });
        idByPendingId.set(image.mediaId, attached.id);
        onImageAttached?.(image.mediaId, attached.id);
      }

      return updateExercise(saved.id, {
        instructions: nullIfEmpty(withResolvedImages(instructions, idByPendingId)),
      });
    },
    // `onSettled` et non `onSuccess` : un échec partiel a pu créer l'exercice ou rattacher des
    // documents, et la bibliothèque doit le montrer sans attendre la fin du `staleTime`.
    onSettled: () => {
      setProgress({});
      return queryClient.invalidateQueries({ queryKey: exerciseKeys.all });
    },
  });

  return {
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error,
    progress,
  };
}

// Un document vide vaut `null`, jamais `[]` (règle nullable n°5).
function nullIfEmpty(blocks: ReturnType<typeof withResolvedImages>) {
  return blocks.length === 0 ? null : blocks;
}

// Suppression d'un document déjà rattaché (mode édition).
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ exerciseId, documentId }: { exerciseId: string; documentId: string }) =>
      deleteDocument(exerciseId, documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}
