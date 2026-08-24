import type { CreateCustomMetricInput, CustomMetric } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCustomMetric, customMetricKeys, listCustomMetrics } from "@/feature/library/api";

/**
 * Les métriques et échelles maison du coach. Chargées une fois pour tout le constructeur : les
 * colonnes de TOUS les blocs y résolvent leur type de valeur et leurs paliers.
 */
export function useCustomMetrics() {
  return useQuery<CustomMetric[]>({
    queryKey: customMetricKeys.list(),
    queryFn: listCustomMetrics,
  });
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
