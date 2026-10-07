import { Role } from "@cmv/shared";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";

const session = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));

vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: session.user }, isPending: false }) },
}));
vi.mock("@/shared/hook/useSentryUser", () => ({ useSentryUser: vi.fn() }));
// Seule l'adresse d'arrivée compte ici : les écrans visés ne sont pas montés.
vi.mock("@/feature/plan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan")>()),
  AthletePlanningScreen: () => null,
}));
vi.mock("@/feature/company", () => ({
  CompanyCoachesScreen: () => null,
  CompanyAthletesScreen: () => null,
}));

async function landingOf(user: Record<string, unknown>): Promise<string> {
  session.user = { id: "u-1", name: "Compte", email: "u@cmv.test", ...user };
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(router.state.location.pathname).not.toBe("/"));
  return router.state.location.pathname;
}

beforeEach(() => {
  session.user = null;
});

/**
 * `/` est l'accueil du coach ; les autres en sont renvoyés chez eux. Le compte Entreprise suivait
 * l'athlète vers `/planning`, qui le refusait et le ramenait ici : la page bouclait (#600).
 */
describe("/ pour qui n'est pas coach", () => {
  it("envoie l'athlète sur son planning", async () => {
    expect(await landingOf({ isAthlete: true, role: Role.ATHLETE })).toBe("/planning");
  });

  it("envoie l'entreprise sur son espace", async () => {
    expect(await landingOf({ isCompany: true, role: Role.COMPANY })).toBe("/company/coaches");
  });
});
