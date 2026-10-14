import type { ChangeAccessInput, ExerciseBlocks, ExerciseDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changeExerciseAccess,
  deleteExercise,
  duplicateExercise,
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

/**
 * La lecture d'un exercice, partagée par l'écran et son « Recharger » (#604) : une seule clé, une
 * seule forme en cache — la relecture remplit exactement ce que l'écran lit.
 */
export const exerciseDetailQuery = (id: string) => ({
  queryKey: exerciseKeys.detail(id),
  queryFn: () => getExercise(id),
});

export function useExercise(id: string | undefined) {
  return useQuery<ExerciseDto>({
    ...exerciseDetailQuery(id ?? ""),
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
    // La version affichée voyage avec l'id (#605, MC-8) : supprimer ce qu'on n'a pas vu est un 409.
    mutationFn: ({ id, updatedAt }: Pick<ExerciseDto, "id" | "updatedAt">) =>
      deleteExercise(id, { expectedUpdatedAt: updatedAt }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}

/**
 * « Dupliquer en variante » : une COPIE indépendante dans la bibliothèque, sur laquelle le coach
 * pourra changer ce que le niveau séance verrouille — structure, colonnes, consigne.
 *
 * La copie se fait côté SERVEUR (#315) : la consigne cite ses images par l'identifiant d'un
 * document de la source, et seul le serveur peut les rattacher à la variante. Recopiée d'ici, elle
 * désignait des documents que la variante n'a pas — ni l'éditeur ni l'athlète ne les affichaient.
 * Les pièces jointes, elles, restent à la source.
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
      // Lue pour son seul titre : le suffixe est traduit, le serveur ne le connaît pas.
      const source = await getExercise(exerciseId);
      return duplicateExercise(exerciseId, {
        title: `${source.title} ${suffix}`,
        ...(blocks == null ? {} : { blocks }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}

/**
 * Change les droits des exercices sélectionnés (#606). Toute la racine est invalidée : la colonne
 * Accès des listes ET le panneau d'un exercice ouvert lisent `grants`.
 */
export function useChangeExerciseAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeAccessInput) => changeExerciseAccess(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}
