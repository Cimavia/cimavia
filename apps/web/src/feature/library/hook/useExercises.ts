import type { ExerciseDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
