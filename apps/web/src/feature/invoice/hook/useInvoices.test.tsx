import { invoiceKeys } from "@cmv/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { useInvoices } from "./useInvoices";

const { listMock, exercisedCapabilityMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  exercisedCapabilityMock: vi.fn(),
}));

// Seul `invoiceApi` est remplacé : `invoiceKeys` doit rester le VRAI, sinon le test vérifierait
// une clé de cache qu'il a lui-même inventée.
vi.mock("@/feature/invoice/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/invoice/api")>()),
  invoiceApi: { list: listMock },
}));

// Coupe la session et le routeur : le titre exercé est une ENTRÉE du hook, pas une chose à
// reconstituer ici. `useCapabilities` a ses propres tests à écrire, ailleurs.
vi.mock("@/shared/hook/useCapabilities", () => ({
  useExercisedCapability: () => exercisedCapabilityMock(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  exercisedCapabilityMock.mockReturnValue(null);
});

describe("useInvoices", () => {
  it("rend les factures servies par l'API", async () => {
    listMock.mockResolvedValue([{ id: "inv-1" }]);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useInvoices(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "inv-1" }]);
  });

  /**
   * Le cas qui justifie le paramètre : sur un compte à double capacité, « émises » et « reçues »
   * sont deux réponses de la MÊME url. Si `as` ne faisait pas partie de la clé, basculer d'espace
   * servirait le cache de l'autre côté — le coach verrait ses propres factures en tant qu'athlète.
   */
  it("range les deux titres dans deux entrées de cache distinctes", async () => {
    listMock.mockResolvedValue([]);
    const { wrapper, queryClient } = renderWithQueryClient();

    exercisedCapabilityMock.mockReturnValue("coach");
    const coach = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(coach.result.current.isSuccess).toBe(true));

    exercisedCapabilityMock.mockReturnValue("athlete");
    const athlete = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(athlete.result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(invoiceKeys.list("coach"))).toBeDefined();
    expect(queryClient.getQueryData(invoiceKeys.list("athlete"))).toBeDefined();
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("transmet le titre exercé à l'API, et non une valeur devinée", async () => {
    listMock.mockResolvedValue([]);
    exercisedCapabilityMock.mockReturnValue("athlete");
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useInvoices(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listMock).toHaveBeenCalledWith("athlete");
  });

  it("expose l'échec au lieu de rendre une liste vide", async () => {
    listMock.mockRejectedValue(new Error("503"));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useInvoices(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
