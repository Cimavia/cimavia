import {
  ApiError,
  ProblemType,
  STRUCTURE_PRESETS,
  type StructureDto,
  type StructureInput,
} from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionKeys, structureKeys } from "@/feature/library/api";
import { renderWithQueryClient } from "../../../../test/query";
import {
  useDeleteStructure,
  useSaveStructure,
  useStructure,
  useStructureLibrary,
} from "./useStructures";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    listStructures: vi.fn(),
    getStructure: vi.fn(),
    createStructure: vi.fn(),
    updateStructure: vi.fn(),
    deleteStructure: vi.fn(),
  },
}));

// Les appels sont remplacés, les clés restent les VRAIES.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  ...apiMock,
}));

const structure = {
  id: "st-1",
  name: "4×4 grimpe",
  updatedAt: "2026-10-12T08:00:00.000Z",
} as StructureDto;
const input: StructureInput = {
  name: "4×4 grimpe",
  tags: [],
  note: null,
  instructions: null,
  settings: STRUCTURE_PRESETS.SERIES,
};

beforeEach(() => {
  vi.clearAllMocks();
});

function spyInvalidate() {
  const client = renderWithQueryClient();
  const invalidate = vi.spyOn(client.queryClient, "invalidateQueries");
  return { ...client, invalidate };
}

describe("useStructureLibrary", () => {
  it("rend les structures prêtes et celles du Coach", async () => {
    const library = { presets: [], structures: [structure] };
    apiMock.listStructures.mockResolvedValue(library);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useStructureLibrary(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(library));
  });
});

describe("useStructure", () => {
  it("charge la structure désignée", async () => {
    apiMock.getStructure.mockResolvedValue(structure);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useStructure("st-1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(structure));
    expect(apiMock.getStructure).toHaveBeenCalledWith("st-1");
  });

  it("ne part pas sans identifiant", () => {
    const { wrapper } = renderWithQueryClient();

    renderHook(() => useStructure(undefined), { wrapper });

    expect(apiMock.getStructure).not.toHaveBeenCalled();
  });
});

describe("useSaveStructure", () => {
  it("crée une structure neuve, et relit les structures", async () => {
    apiMock.createStructure.mockResolvedValue(structure);
    const { wrapper, invalidate } = spyInvalidate();
    const { result } = renderHook(() => useSaveStructure(), { wrapper });

    await act(() => result.current.mutateAsync({ structure: null, input }));

    expect(apiMock.createStructure).toHaveBeenCalledWith(input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: structureKeys.all });
  });

  it("modifie sous la version lue", async () => {
    apiMock.updateStructure.mockResolvedValue(structure);
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useSaveStructure(), { wrapper });

    await act(() => result.current.mutateAsync({ structure, input }));

    expect(apiMock.updateStructure).toHaveBeenCalledWith("st-1", {
      ...input,
      expectedUpdatedAt: structure.updatedAt,
    });
  });
});

describe("useSaveStructure — refus", () => {
  it("un nom refusé relit la liste, qui ne connaît pas encore la structure qui le porte", async () => {
    apiMock.createStructure.mockRejectedValue(
      new ApiError(409, "Nom pris", null, true, ProblemType.STRUCTURE_NAME_TAKEN),
    );
    const { wrapper, invalidate } = spyInvalidate();
    const { result } = renderHook(() => useSaveStructure(), { wrapper });

    await act(() => result.current.mutateAsync({ structure: null, input }).catch(() => undefined));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: structureKeys.library() });
  });

  it("un autre refus ne relit rien", async () => {
    apiMock.createStructure.mockRejectedValue(
      new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE),
    );
    const { wrapper, invalidate } = spyInvalidate();
    const { result } = renderHook(() => useSaveStructure(), { wrapper });

    await act(() => result.current.mutateAsync({ structure: null, input }).catch(() => undefined));

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useDeleteStructure", () => {
  it("supprime sous la version lue, oublie la structure et relit les séances", async () => {
    apiMock.deleteStructure.mockResolvedValue(undefined);
    const { wrapper, invalidate, queryClient } = spyInvalidate();
    const remove = vi.spyOn(queryClient, "removeQueries");
    const { result } = renderHook(() => useDeleteStructure(), { wrapper });

    await act(() => result.current.mutateAsync(structure));

    expect(apiMock.deleteStructure).toHaveBeenCalledWith("st-1", {
      expectedUpdatedAt: structure.updatedAt,
    });
    expect(remove).toHaveBeenCalledWith({ queryKey: structureKeys.detail("st-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: structureKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
  });
});
