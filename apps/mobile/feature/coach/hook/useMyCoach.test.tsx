import type { CoachAthleteDto } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCounterparts } from "@/feature/account/hook/useCounterparts";
import { useAcceptInvitation } from "@/feature/coach/hook/useMyCoach";

const { acceptMock, counterpartsMock } = vi.hoisted(() => ({
  acceptMock: vi.fn(),
  counterpartsMock: vi.fn(),
}));

// Seuls les appels réseau sont remplacés : les clés de cache restent les VRAIES, sinon le test
// vérifierait une invalidation sur une clé qu'il a lui-même inventée.
vi.mock("@/feature/coach/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/coach/api")>()),
  accountApi: { acceptInvitation: acceptMock },
}));
vi.mock("@/feature/account/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/account/api")>()),
  accountApi: { myCounterparts: counterpartsMock },
}));

const RELATION = {
  id: "rel_1",
  coachId: "u_coach",
  coachName: "Julie Renaud",
  athleteId: "u_athlete",
  athleteName: "Léa",
  status: "ACTIVE",
  invitedAt: "2026-03-12T09:00:00.000Z",
  joinedAt: "2026-03-12T09:00:00.000Z",
  isSelf: false,
} as CoachAthleteDto;

let queryClient: QueryClient;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * La barre d'onglets et l'écran « Rejoindre » vivent EN MÊME TEMPS : `app/(app)/_layout.tsx` reste
 * monté sous `join`. D'où un seul `renderHook` qui porte les deux — l'observateur des contreparties
 * n'est jamais remonté, comme dans l'app, et seule l'invalidation peut le faire refetcher.
 */
function renderJoinOverTabs() {
  return renderHook(() => ({ accept: useAcceptInvitation(), counterparts: useCounterparts() }), {
    wrapper,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  counterpartsMock.mockResolvedValue({ asCoach: false, asAthlete: false });
});

describe("useAcceptInvitation — ce que l'athlète peut voir (#308)", () => {
  /**
   * Le bug : l'athlète venait de rejoindre son coach et n'avait pas d'onglet Messages tant qu'il
   * n'avait pas mis l'app en arrière-plan. `asAthlete` doit passer à `true` sans remontage.
   */
  it("fait apparaître le coach dans la barre d'onglets, sans la remonter", async () => {
    acceptMock.mockResolvedValue(RELATION);
    const { result } = renderJoinOverTabs();
    await waitFor(() => expect(result.current.counterparts.asAthlete).toBe(false));

    counterpartsMock.mockResolvedValue({ asCoach: false, asAthlete: true });
    result.current.accept.mutate("inv_1");

    await waitFor(() => expect(result.current.counterparts.asAthlete).toBe(true));
  });

  // L'échec n'invalide rien : rien n'a changé côté serveur, et refetcher masquerait l'erreur.
  it("ne touche pas au cache quand l'acceptation échoue", async () => {
    acceptMock.mockRejectedValue(new Error("404"));
    const { result } = renderJoinOverTabs();
    await waitFor(() => expect(result.current.counterparts.asAthlete).toBe(false));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    result.current.accept.mutate("inv_perimee");

    await waitFor(() => expect(result.current.accept.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(counterpartsMock).toHaveBeenCalledTimes(1);
  });
});
