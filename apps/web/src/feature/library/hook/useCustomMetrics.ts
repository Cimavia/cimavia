import {
  type CreateCustomMetricInput,
  type CustomMetric,
  canWrite,
  type ExerciseDto,
  foreignOf,
  required,
  type UpdateCustomMetricInput,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCustomMetric,
  customMetricKeys,
  deleteCustomMetric,
  exerciseKeys,
  listCustomMetrics,
  listExerciseCustomMetrics,
  updateCustomMetric,
} from "@/feature/library/api";

const ownCatalogQuery = { queryKey: customMetricKeys.list(), queryFn: listCustomMetrics };

/**
 * Les métriques et échelles maison du coach. Chargées une fois pour tout le constructeur : les
 * colonnes de TOUS les blocs y résolvent leur type de valeur et leurs paliers.
 */
export function useCustomMetrics() {
  return useQuery<CustomMetric[]>(ownCatalogQuery);
}

/**
 * Le catalogue où se choisissent et se résolvent les colonnes d'un exercice : celui du Coach pour
 * le sien — ou pour un exercice qui naît —, celui du PROPRIÉTAIRE pour l'exercice d'un autre
 * (#605). Une seule des deux requêtes part.
 *
 * `null` est l'exercice qui NAÎT, pas celui qui charge : l'appelant attend l'exercice avant de
 * demander son catalogue, sinon celui du Coach partirait d'abord pour rien. En Lecture, rien ne se
 * choisit : aucune requête, les métriques que l'exercice cite arrivent avec lui (`customMetrics`).
 */
export function useExerciseCatalog(exercise: ExerciseDto | null) {
  const foreign = foreignOf(exercise);
  const own = useQuery<CustomMetric[]>({ ...ownCatalogQuery, enabled: foreign == null });
  const owners = useQuery<CustomMetric[]>({
    queryKey: exerciseKeys.customMetrics(foreign?.id ?? ""),
    queryFn: () => listExerciseCustomMetrics(required(foreign, "catalogue sans exercice").id),
    enabled: foreign != null && canWrite(foreign.myAccess),
  });
  return foreign == null ? own : owners;
}

/**
 * Crée une métrique maison. Le cache est invalidé plutôt que complété à la main : la liste est
 * courte, et le serveur est seul à connaître l'identifiant attribué.
 */
export function useCreateCustomMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomMetricInput) => createCustomMetric(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customMetricKeys.all }),
  });
}

export function useUpdateCustomMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomMetricInput }) =>
      updateCustomMetric(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customMetricKeys.all }),
  });
}

/**
 * Supprime une métrique maison. Les colonnes qui la citaient deviennent orphelines —
 * `validateBlockValues` les signale au coach (dette EX-2). Les planifications déjà diffusées, elles,
 * en gardent la définition dans leur snapshot et ne bougent pas.
 */
export function useDeleteCustomMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomMetric(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customMetricKeys.all }),
  });
}
