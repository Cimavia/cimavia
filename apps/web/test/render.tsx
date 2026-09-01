import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
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

type RouteOptions = {
  /**
   * L'id de route sous lequel le composant est monté. Il doit être IDENTIQUE à celui que l'écran
   * réclame par `getRouteApi(...)` — c'est par cette chaîne que `useParams` retrouve son match.
   */
  path: string;
  /** Les valeurs des segments dynamiques de `path`, qui composent l'URL de départ. */
  params?: Readonly<Record<string, string>>;
  /**
   * Les autres routes que l'écran CITE dans ses `<Link>` ou ses `navigate()`. Sans elles, le
   * routeur ne sait pas résoudre la cible et le lien tombe. Elles ne rendent rien : ce qui est
   * vérifié est vers où l'écran pointe, pas ce qu'il y a au bout.
   */
  links?: readonly string[];
};

/**
 * Monte un écran dans un VRAI routeur en mémoire, en plus des fournisseurs ci-dessus.
 *
 * Un vrai routeur et non un mock de `@tanstack/react-router` : `AthleteFeedbackScreen` appelle
 * `getRouteApi("/sessions/$sessionId/feedback")` au niveau MODULE, et remplacer le module rendrait
 * le test aveugle au jour où cet id change — c'est-à-dire au seul défaut que ce mock aurait pu
 * attraper.
 */
export async function renderInRoute(
  ui: ReactElement,
  { path, params = {}, links = [] }: RouteOptions,
): Promise<RenderWithProviders & { router: AnyRouter }> {
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path, component: () => ui }),
    ...links.map((linkPath) =>
      createRoute({ getParentRoute: () => rootRoute, path: linkPath, component: () => null }),
    ),
  ]);

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [interpolate(path, params)] }),
  });

  // `load()` AVANT le rendu, et l'helper est asynchrone pour ça : `RouterProvider` résout ses
  // matches en tâche de fond, si bien qu'un rendu synchrone laisse le DOM VIDE au premier tour.
  // Un test qui affirme une absence passerait alors sans avoir rien vu — le pire des verts.
  await router.load();

  return { ...renderWithProviders(<RouterProvider router={router} />), router };
}

/** `/sessions/$sessionId/feedback` + `{ sessionId: "ss-1" }` → `/sessions/ss-1/feedback`. */
function interpolate(path: string, params: Readonly<Record<string, string>>): string {
  return Object.entries(params).reduce(
    (url, [name, value]) => url.replace(`$${name}`, value),
    path,
  );
}
