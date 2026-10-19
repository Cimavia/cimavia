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
import { isUnauthorizedError } from "@/shared/lib/api";
import { uploadToSignedUrl } from "@/shared/lib/upload";

// Fichier sélectionné mais pas encore envoyé (l'upload n'a lieu qu'à l'enregistrement, car
// les documents se rattachent à un exercice qui doit d'abord exister).
// `mimeType` porte le type DÉJÀ validé (File.type n'est qu'une string) : le compilateur
// garantit qu'aucun fichier non autorisé n'atteint l'API.
export type PendingFile = { id: string; file: File; mimeType: DocumentMimeType };

/**
 * L'exercice qu'un enregistrement réécrit, et la version que la saisie a lue (#604) : l'API refuse
 * en 409 une écriture dont l'exercice a changé depuis. Un `ExerciseDto` en est un.
 */
export type ExerciseVersion = Pick<ExerciseDto, "id" | "updatedAt">;

/**
 * Un document — pièce jointe, image de consigne ou lien — qui n'a pas pu être joint. Il ne se lève
 * qu'APRÈS l'écriture de l'exercice : l'écran peut donc dire que la saisie est enregistrée, et
 * qu'il suffit de réessayer, ce qui ne renvoie que ce qui manque (#302). Sans lui, le Coach lisait
 * l'erreur brute de l'API sans savoir ce qui était perdu (#649). La cause garde la raison d'un
 * refus de l'API, que l'écran redit.
 */
export class AttachmentFailedError extends Error {
  constructor(
    readonly fileName: string,
    cause: unknown,
  ) {
    super(
      `[library] « ${fileName} » non joint : ${cause instanceof Error ? cause.message : cause}`,
      {
        cause,
      },
    );
    this.name = "AttachmentFailedError";
  }
}

/**
 * Joint un document, et nomme celui qui échoue. Une session perdue passe telle quelle : la fenêtre
 * de reconnexion la dit déjà (#336), et le formulaire n'a rien à y ajouter.
 */
async function joining<T>(name: string, send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (isUnauthorizedError(error)) throw error;
    throw new AttachmentFailedError(name, error);
  }
}

type FileToAttach = {
  file: File;
  mimeType: DocumentMimeType;
  onProgress: (percent: number) => void;
  /** Absent : une pièce jointe. */
  usage?: DocumentUsage;
};

/** Ticket, envoi au storage, rattachement : un fichier joint de bout en bout. */
function attachFile(exerciseId: string, { file, mimeType, onProgress, usage }: FileToAttach) {
  return joining(file.name, async () => {
    const { uploadUrl, storagePath } = await requestUploadUrl(exerciseId, {
      fileName: file.name,
      mimeType,
      size: file.size,
    });
    await uploadToSignedUrl(uploadUrl, file, onProgress);
    return attachDocument(exerciseId, {
      type: DocumentType.FILE,
      storagePath,
      fileName: file.name,
      mimeType,
      // Redite du ticket : l'API la confronte à ce que le storage a reçu (#317).
      size: file.size,
      ...(usage != null && { usage }),
    });
  });
}

type SaveExerciseArgs = {
  // null = création ; sinon édition de cet exercice, à la version que la saisie a lue.
  exercise: ExerciseVersion | null;
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
          : await updateExercise(exercise.id, {
              ...firstPass,
              expectedUpdatedAt: exercise.updatedAt,
            });
      onExerciseSaved?.(saved);

      // Envois séquentiels : progression lisible et pas de rafale vers l'object storage.
      for (const pending of pendingFiles) {
        await attachFile(saved.id, {
          file: pending.file,
          mimeType: pending.mimeType,
          onProgress: (percent) =>
            setProgress((current) => ({ ...current, [pending.id]: percent })),
        });
        onFileAttached?.(pending.id);
      }

      for (const url of pendingLinks) {
        await joining(url, () => attachDocument(saved.id, { type: DocumentType.LINK, url }));
        onLinkAttached?.(url);
      }

      // Rien à envoyer : les images déjà envoyées ont été écrites résolues au temps 1.
      if (instructions == null || pendingImages.length === 0 || !hasPendingImages(instructions)) {
        return saved;
      }

      const idByPendingId = new Map(sentImages);
      for (const image of pendingImages) {
        const attached = await attachFile(saved.id, {
          file: image.file,
          mimeType: image.mimeType,
          onProgress: (percent) => onImageProgress?.(image.mediaId, percent),
          // Ce qui l'exclut de la liste des pièces jointes : elle est DANS la consigne.
          usage: DocumentUsage.INSTRUCTION,
        });
        idByPendingId.set(image.mediaId, attached.id);
        onImageAttached?.(image.mediaId, attached.id);
      }

      // La version que le temps 1 vient de rendre : c'est NOTRE écriture, pas un conflit. Les
      // rattachements ne la font pas avancer — ils n'écrivent pas la ligne de l'exercice.
      return updateExercise(saved.id, {
        instructions: nullIfEmpty(withResolvedImages(instructions, idByPendingId)),
        expectedUpdatedAt: saved.updatedAt,
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
