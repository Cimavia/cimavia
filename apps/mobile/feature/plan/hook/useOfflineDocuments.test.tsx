import type { PlanDto } from "@cmv/shared";
import { act, waitFor } from "@testing-library/react";
import { AppState, type AppStateStatus } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderRn } from "../../../test/render";

let reachable: boolean | null = true;
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: reachable }),
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
}));

let plans: PlanDto[] | undefined;
vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useMyPlans: () => ({ data: plans }) }));

// La signature reste la vraie : c'est elle qui décide quand une passe est nécessaire.
const syncOfflineDocuments = vi.fn(async (): Promise<boolean> => true);
vi.mock("@/feature/plan/lib/offline-documents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/lib/offline-documents")>()),
  syncOfflineDocuments: () => syncOfflineDocuments(),
}));

const addAppStateListener = vi.spyOn(AppState, "addEventListener");

const { useOfflineDocuments } = await import("./useOfflineDocuments");

function Probe() {
  useOfflineDocuments();
  return null;
}

function planNamed(id: string, updatedAt: string, sessionUpdatedAt?: string): PlanDto {
  const sessions =
    sessionUpdatedAt == null ? [] : [{ id: `${id}-s1`, updatedAt: sessionUpdatedAt }];
  return { id, updatedAt, weeks: [{ sessions }] } as unknown as PlanDto;
}

/** L'app revient au premier plan — le dernier écouteur posé est celui du rendu courant. */
function comeToForeground() {
  const listener = addAppStateListener.mock.calls.at(-1)?.[1] as
    | ((status: AppStateStatus) => void)
    | undefined;
  if (listener == null) throw new Error("aucun écouteur d'AppState posé");
  act(() => listener("active"));
}

beforeEach(() => {
  vi.clearAllMocks();
  syncOfflineDocuments.mockResolvedValue(true);
  reachable = true;
  plans = undefined;
});

describe("useOfflineDocuments", () => {
  it("lance une passe dès que les cycles sont connus", async () => {
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];

    renderRn(<Probe />);

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));
  });

  /**
   * Hors réseau il n'y a rien à descendre, et la purge n'a aucune urgence : une passe ne ferait
   * que consommer de la batterie pour enchaîner des échecs.
   */
  it("ne lance rien hors réseau", () => {
    reachable = false;
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];

    renderRn(<Probe />);

    expect(syncOfflineDocuments).not.toHaveBeenCalled();
  });

  it("ne lance rien tant qu'aucun cycle n'est chargé", () => {
    renderRn(<Probe />);

    expect(syncOfflineDocuments).not.toHaveBeenCalled();
  });

  /**
   * Le refetch des cycles rend un tableau NEUF toutes les cinq minutes, à contenu identique. Sans
   * la signature, chacun relancerait une passe sur toutes les séances de tous les cycles.
   */
  it("ne relance pas une passe quand les cycles n'ont pas changé", async () => {
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];
    const { rerender } = renderRn(<Probe />);

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));

    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];
    rerender(<Probe />);

    expect(syncOfflineDocuments).toHaveBeenCalledTimes(1);
  });

  it("relance une passe quand un cycle a été ajusté", async () => {
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];
    const { rerender } = renderRn(<Probe />);

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));

    plans = [planNamed("plan-1", "2026-08-12T09:00:00.000Z")];
    rerender(<Probe />);

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(2));
  });

  /**
   * Le scénario de #307 : le coach retouche la séance de jeudi. La ligne `Plan` ne bouge pas ;
   * seule la date de la séance le dit, et l'athlète doit retrouver la nouvelle version en salle.
   */
  it("relance une passe quand une séance a été retouchée, le cycle restant le même", async () => {
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z", "2026-08-10T00:00:00.000Z")];
    const { rerender } = renderRn(<Probe />);

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));

    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z", "2026-08-12T18:00:00.000Z")];
    rerender(<Probe />);

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(2));
  });
});

describe("useOfflineDocuments — passe incomplète (#307)", () => {
  it("reprend une passe incomplète au retour du réseau", async () => {
    syncOfflineDocuments.mockResolvedValueOnce(false);
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];
    const { rerender } = renderRn(<Probe />);
    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));

    reachable = false;
    rerender(<Probe />);
    reachable = true;
    rerender(<Probe />);

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(2));
  });

  it("reprend une passe incomplète au retour de l'app au premier plan", async () => {
    syncOfflineDocuments.mockResolvedValueOnce(false);
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];
    renderRn(<Probe />);
    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));

    comeToForeground();

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(2));
  });

  it("ne refait pas une passe complète au retour de l'app au premier plan", async () => {
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];
    renderRn(<Probe />);
    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));
    await act(async () => undefined);

    comeToForeground();

    expect(syncOfflineDocuments).toHaveBeenCalledTimes(1);
  });

  /** Une API en panne ne doit pas faire enchaîner les passes tant que l'app reste en ligne. */
  it("ne reprend pas en boucle une passe incomplète", async () => {
    syncOfflineDocuments.mockResolvedValue(false);
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];
    const { rerender } = renderRn(<Probe />);
    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));
    await act(async () => undefined);

    rerender(<Probe />);

    expect(syncOfflineDocuments).toHaveBeenCalledTimes(1);
  });

  /**
   * Des cycles qui changent PENDANT une passe : leur essai heurte la passe en cours. Sans
   * rattrapage, ils attendraient le prochain refetch — ou le prochain démarrage.
   */
  it("rattrape à la fin d'une passe les cycles qui ont changé pendant", async () => {
    let finish: (complete: boolean) => void = () => undefined;
    syncOfflineDocuments.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    plans = [planNamed("plan-1", "2026-08-10T00:00:00.000Z")];
    const { rerender } = renderRn(<Probe />);
    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(1));

    plans = [planNamed("plan-1", "2026-08-12T09:00:00.000Z")];
    rerender(<Probe />);
    expect(syncOfflineDocuments).toHaveBeenCalledTimes(1);

    await act(async () => finish(true));

    await waitFor(() => expect(syncOfflineDocuments).toHaveBeenCalledTimes(2));
  });
});
