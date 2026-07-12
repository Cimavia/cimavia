import {
  type CreateExerciseInput,
  type DocumentMimeType,
  DocumentType,
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
};

export function useSaveExercise() {
  const queryClient = useQueryClient();
  // Progression d'upload par fichier en attente (0–100).
  const [progress, setProgress] = useState<Record<string, number>>({});

  const mutation = useMutation({
    mutationFn: async ({ exercise, input, pendingFiles, pendingLinks }: SaveExerciseArgs) => {
      const saved =
        exercise == null ? await createExercise(input) : await updateExercise(exercise.id, input);

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
        });
      }

      for (const url of pendingLinks) {
        await attachDocument(saved.id, { type: DocumentType.LINK, url });
      }

      return saved;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
    onSettled: () => setProgress({}),
  });

  return {
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error,
    progress,
  };
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
