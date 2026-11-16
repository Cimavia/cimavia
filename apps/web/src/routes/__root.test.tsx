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
import { useBundleUpdate, useIsBundleUpdateAvailable } from "@/shared/hook/useBundleUpdate";
import { useSentryUser } from "@/shared/hook/useSentryUser";

vi.mock("@/shared/hook/useSentryUser", () => ({ useSentryUser: vi.fn() }));
vi.mock("@/shared/hook/useBundleUpdate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/hook/useBundleUpdate")>()),
  useBundleUpdate: vi.fn(() => false),
}));

const CHILD = "l'écran sous la racine";

function Child() {
  return (
    <>
      <p>{CHILD}</p>
      <p>{useIsBundleUpdateAvailable() ? "nouvelle version" : "à jour"}</p>
    </>
  );
}

async function renderRoot() {
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/", component: Child }),
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
  // `clearAllMocks` garde les valeurs de retour : celle d'un test ne doit pas fuir dans le suivant.
  vi.mocked(useBundleUpdate).mockReturnValue(false);
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

  it("transmet aux écrans la nouvelle version qu'elle a vue (#290)", async () => {
    vi.mocked(useBundleUpdate).mockReturnValue(true);
    await renderRoot();

    // Ici et pas dans `CmvAppShell`, que chaque écran remonte : ce qui a été vu y serait oublié
    // à la navigation suivante.
    expect(screen.getByText("nouvelle version")).toBeInTheDocument();
  });
});
