import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as rootRoute } from "@/routes/__root";
import { useSentryUser } from "@/shared/hook/useSentryUser";

vi.mock("@/shared/hook/useSentryUser", () => ({ useSentryUser: vi.fn() }));

const CHILD = "l'écran sous la racine";

async function renderRoot() {
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <p>{CHILD}</p> }),
  ]);
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  await router.load();
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("route racine", () => {
  it("rend l'écran de la route sous elle", async () => {
    await renderRoot();

    expect(screen.getByText(CHILD)).toBeInTheDocument();
  });

  it("pose l'identité Sentry ici, et pas dans un écran", async () => {
    await renderRoot();

    // C'est le seul composant monté sur TOUTES les routes. Déplacer cet appel dans `CmvAppShell`
    // — la piste qu'ouvrait #181 — le retirerait des écrans d'authentification, où un crash
    // redeviendrait anonyme. Ce test est ce qui rend ce déplacement rouge.
    expect(useSentryUser).toHaveBeenCalled();
  });
});
