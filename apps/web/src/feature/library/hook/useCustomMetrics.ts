import type { CustomMetric } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { customMetricKeys, listCustomMetrics } from "@/feature/library/api";

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
