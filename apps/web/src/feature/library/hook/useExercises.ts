import type { ExerciseBlocks, ExerciseDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExercise,
  deleteExercise,
  type ExerciseFilters,
  exerciseKeys,
  getExercise,
  listExercises,
  listExerciseTags,
} from "@/feature/library/api";

export function useExercises(filters: ExerciseFilters) {
  return useQuery<ExerciseDto[]>({
    queryKey: exerciseKeys.list(filters),
    queryFn: () => listExercises(filters),
  });
}

export function useExercise(id: string | undefined) {
  return useQuery<ExerciseDto>({
    queryKey: exerciseKeys.detail(id ?? ""),
    queryFn: () => getExercise(id as string),
    // `new` n'a pas d'id : la requête ne part pas, plutôt qu'un GET /exercises/undefined.
    enabled: id != null,
  });
}

export function useExerciseTags() {
  return useQuery<string[]>({ queryKey: exerciseKeys.tags(), queryFn: listExerciseTags });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExercise(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}

/**
 * « Dupliquer en variante » : une COPIE indépendante dans la bibliothèque, sur laquelle le coach
 * pourra changer ce que le niveau séance verrouille — structure, colonnes, consigne.
 *
 * Les pièces jointes ne suivent PAS : elles pointent vers des objets de stockage, et les dupliquer
 * demanderait de recopier des binaires ou de partager des clés entre deux exercices dont l'un peut
 * être supprimé. La consigne et le dosage, eux, sont de la donnée pure.
 */
export function useDuplicateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      exerciseId,
      suffix,
      blocks,
    }: {
      exerciseId: string;
      suffix: string;
      /**
       * Le dosage à graver dans la variante. Depuis une séance, c'est celui de la SÉANCE et non
       * celui de la bibliothèque : le coach duplique justement parce que ses ajustements
       * demandent de changer ce que le niveau séance verrouille. Repartir du défaut lui ferait
       * tout ressaisir.
       */
      blocks?: ExerciseBlocks;
    }) => {
      const source = await getExercise(exerciseId);
      return createExercise({
        title: `${source.title} ${suffix}`,
        description: source.description,
        instructions: source.instructions,
        blocks: blocks ?? source.blocks,
        tags: source.tags,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}
