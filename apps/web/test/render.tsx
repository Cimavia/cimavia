import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { type RenderResult, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@/shared/component/CmvToast";
import { createTestI18n } from "./i18n";
import { renderWithQueryClient } from "./query";

type RenderWithProviders = RenderResult & {
  user: ReturnType<typeof userEvent.setup>;
  queryClient: QueryClient;
};

/**
 * Monte un composant dans les fournisseurs que `main.tsx` pose à la racine — i18next, le cache
 * TanStack Query, les toasts.
 *
 * Le client de requêtes vient de `renderWithQueryClient` (#58) et n'est pas refabriqué ici : sa
 * configuration (`retry: false`, `gcTime: 0`) est ce qui rend un test d'erreur observable et deux
 * tests indépendants, et deux copies de ce réglage divergeraient sans que rien ne devienne rouge.
 *
 * Ce que ce harnais ne monte PAS : le routeur. Sur les cibles de #188, six composants sur huit
 * n'importent rien de `@tanstack/react-router` ; leur imposer un arbre de routes ferait payer à
 * chaque test la mise en scène d'une navigation étrangère à ce qu'il vérifie. Les deux écrans qui
 * en dépendent auront leur propre helper.
 *
 * `userEvent` est rendu avec le résultat plutôt que laissé à l'appelant : il s'installe sur le
 * document au moment du `setup()`, et le créer après coup dans chaque test produit des
 * interactions qui semblent marcher jusqu'à la première qui en enchaîne deux.
 */
export function renderWithProviders(ui: ReactElement): RenderWithProviders {
  const user = userEvent.setup();
  const { queryClient } = renderWithQueryClient();
  const i18n = createTestI18n();

  const result = render(ui, {
    wrapper: ({ children }: Readonly<{ children: ReactNode }>) => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </I18nextProvider>
    ),
  });

  return { ...result, user, queryClient };
}
