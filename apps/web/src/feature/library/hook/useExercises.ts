import type { ExerciseDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteExercise,
  type ExerciseFilters,
  exerciseKeys,
  listExercises,
} from "@/feature/library/api";

export function useExercises(filters: ExerciseFilters) {
  return useQuery<ExerciseDto[]>({
    queryKey: exerciseKeys.list(filters),
    queryFn: () => listExercises(filters),
  });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExercise(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}
