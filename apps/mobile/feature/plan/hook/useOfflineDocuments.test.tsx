import type { PlanDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderRn } from "../../../test/render";

let reachable: boolean | null = true;
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: reachable }),
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
}));

let plans: PlanDto[] | undefined;
vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useMyPlans: () => ({ data: plans }) }));

const syncOfflineDocuments = vi.fn(async () => undefined);
vi.mock("@/feature/plan/lib/offline-documents", () => ({
  syncOfflineDocuments: () => syncOfflineDocuments(),
}));

const { useOfflineDocuments } = await import("./useOfflineDocuments");

function Probe() {
  useOfflineDocuments();
  return null;
}

function planNamed(id: string, updatedAt: string): PlanDto {
  return { id, updatedAt, weeks: [] } as unknown as PlanDto;
}

beforeEach(() => {
  vi.clearAllMocks();
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
});
