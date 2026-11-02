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
 *
 * `delay: null` (#683) : par défaut, chaque frappe d'un `user.type` attend un tour de boucle
 * d'événements avant la suivante. Aucun test ne vérifie ce qui s'affiche ENTRE deux frappes, et ce
 * tour coûtait ~8 % du temps de la suite web (251 s → 230 s cumulées, 2162 tests verts des deux
 * côtés). Un test qui viendrait à dépendre d'un rendu intermédiaire n'a qu'à passer par ses propres
 * `await`, pas à rétablir le délai pour tous.
 */
export function renderWithProviders(ui: ReactElement): RenderWithProviders {
  const user = userEvent.setup({ delay: null });
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
   * Un segment à `_` final (`$planId_`) garde son id, mais son paramètre se nomme sans (`planId`).
   */
  path: string;
  /** Les valeurs des segments dynamiques de `path`, qui composent l'URL de départ. */
  params?: Readonly<Record<string, string>>;
  /**
   * Les paramètres de requête de l'URL de départ.
   *
   * Plusieurs écrans portent leur état dans l'URL plutôt que dans un `useState` — le débrief
   * ouvert, le filtre du tableau de suivi. Les éprouver demande d'arriver AVEC, exactement comme
   * un lien profond ou un signet le ferait.
   */
  search?: Readonly<Record<string, string>>;
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
  { path, params = {}, links = [], search = {} }: RouteOptions,
): Promise<RenderWithProviders & { router: AnyRouter }> {
  const rootRoute = createRootRoute();
  const urlPath = urlPathOf(path);
  const screen = createRoute({
    getParentRoute: () => rootRoute,
    path: urlPath,
    component: () => ui,
  });
  // `createRoute` refuse un id ET un chemin : l'id se pose après coup, par `update`, comme le fait
  // le routeur généré — qui ne le type pas davantage, d'où la conversion.
  if (urlPath !== path) screen.update({ id: path } as Parameters<typeof screen.update>[0]);
  const routeTree = rootRoute.addChildren([
    screen,
    ...links.map((linkPath) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path: urlPathOf(linkPath),
        component: () => null,
      }),
    ),
  ]);

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [interpolate(urlPath, params) + queryOf(search)],
    }),
  });

  // `load()` AVANT le rendu, et l'helper est asynchrone pour ça : `RouterProvider` résout ses
  // matches en tâche de fond, si bien qu'un rendu synchrone laisse le DOM VIDE au premier tour.
  // Un test qui affirme une absence passerait alors sans avoir rien vu — le pire des verts.
  await router.load();

  return { ...renderWithProviders(<RouterProvider router={router} />), router };
}

/**
 * Le chemin d'URL d'un id de route : `$planId_` y perd son `_` final, qui dit seulement « hors du
 * layout parent » — `/plans/$planId_/dosage` ne monte pas le constructeur. Le paramètre s'appelle
 * alors `planId`, comme dans le routeur généré.
 */
function urlPathOf(id: string): string {
  return id.replaceAll(/_(?=\/|$)/g, "");
}

/** `{ feedback: "f-1" }` → `?feedback=f-1`, et rien du tout quand il n'y a rien à poser. */
function queryOf(search: Readonly<Record<string, string>>): string {
  const entries = Object.entries(search);
  return entries.length === 0 ? "" : `?${new URLSearchParams(entries).toString()}`;
}

/**
 * `/sessions/$sessionId/feedback` + `{ sessionId: "ss-1" }` → `/sessions/ss-1/feedback`.
 *
 * Un segment resté sans valeur lève : le routeur l'accepterait comme une valeur littérale
 * (`$planId`), et l'écran lirait un identifiant que le test n'a jamais donné.
 */
function interpolate(path: string, params: Readonly<Record<string, string>>): string {
  const url = Object.entries(params).reduce(
    (current, [name, value]) => current.replace(`$${name}`, value),
    path,
  );
  if (url.includes("$")) throw new Error(`renderInRoute : un paramètre manque à ${url}`);
  return url;
}
