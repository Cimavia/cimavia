import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Le contexte minimal qu'un hook TanStack Query réclame pour tourner hors d'un écran.
 *
 * `retry: false` n'est pas un détail de confort : avec la politique par défaut, une requête qui
 * échoue est rejouée trois fois avec un délai croissant, et le test qui vérifie l'ERREUR expire
 * avant de la voir. Le harnais mesure la logique du hook, pas la ténacité du réseau.
 *
 * `gcTime: 0` isole les tests les uns des autres : un cache qui survit ferait passer un test parce
 * que le précédent avait déjà chargé la donnée — le pire des verts.
 */
export function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
}
