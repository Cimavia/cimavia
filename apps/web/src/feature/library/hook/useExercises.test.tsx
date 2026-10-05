import type { ExerciseDto } from "@cmv/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exerciseKeys } from "@/feature/library/api";
import { renderWithQueryClient } from "../../../../test/query";
import {
  useDeleteExercise,
  useDuplicateExercise,
  useExercise,
  useExercises,
  useExerciseTags,
} from "./useExercises";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    listExercises: vi.fn(),
    getExercise: vi.fn(),
    listExerciseTags: vi.fn(),
    deleteExercise: vi.fn(),
    duplicateExercise: vi.fn(),
  },
}));

// Les appels sont remplacés, les clés restent les VRAIES : sinon le test vérifierait une clé de
// cache qu'il aurait lui-même inventée.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  ...apiMock,
}));

const source = {
  id: "ex-1",
  title: "Tractions",
  description: "Prise pronation",
  instructions: [{ type: "paragraph", content: [] }],
  blocks: [{ id: "b-source" }],
  tags: ["force"],
} as unknown as ExerciseDto;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Le client de test a `gcTime: 0` : une entrée posée sans observateur disparaît aussitôt, son état
 * d'invalidation avec elle. On observe donc la demande d'invalidation, sur la racine des exercices.
 */
function spyInvalidate() {
  const client = renderWithQueryClient();
  const invalidate = vi.spyOn(client.queryClient, "invalidateQueries");
  return { ...client, invalidate };
}

describe("useExercises", () => {
  it("rend la liste servie pour les filtres demandés", async () => {
    apiMock.listExercises.mockResolvedValue([source]);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useExercises({ tag: "force" }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([source]));
    expect(apiMock.listExercises).toHaveBeenCalledWith({ tag: "force" });
  });
});

describe("useExercise", () => {
  it("charge l'exercice désigné par l'url", async () => {
    apiMock.getExercise.mockResolvedValue(source);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useExercise("ex-1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(source));
    expect(apiMock.getExercise).toHaveBeenCalledWith("ex-1");
  });

  // Le constructeur en création n'a pas d'id : aucun GET /exercises/undefined ne doit partir.
  it("ne part pas sans id", async () => {
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useExercise(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(apiMock.getExercise).not.toHaveBeenCalled();
  });
});

describe("useExerciseTags", () => {
  it("rend les tags du coach", async () => {
    apiMock.listExerciseTags.mockResolvedValue(["force", "doigts"]);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useExerciseTags(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(["force", "doigts"]));
  });
});

describe("useDeleteExercise", () => {
  it("supprime puis invalide toute la bibliothèque d'exercices", async () => {
    apiMock.deleteExercise.mockResolvedValue(undefined);
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useDeleteExercise(), { wrapper });
    await result.current.mutateAsync("ex-1");

    expect(apiMock.deleteExercise).toHaveBeenCalledWith("ex-1");
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: exerciseKeys.all });
  });

  it("n'invalide rien quand la suppression échoue", async () => {
    apiMock.deleteExercise.mockRejectedValue(new Error("500"));
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useDeleteExercise(), { wrapper });
    await expect(result.current.mutateAsync("ex-1")).rejects.toThrow("500");

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useDuplicateExercise", () => {
  it("demande au serveur une copie de la source, titre suffixé", async () => {
    apiMock.getExercise.mockResolvedValue(source);
    apiMock.duplicateExercise.mockResolvedValue({ ...source, id: "ex-2" });
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useDuplicateExercise(), { wrapper });
    const created = await result.current.mutateAsync({ exerciseId: "ex-1", suffix: "(variante)" });

    expect(created.id).toBe("ex-2");
    expect(apiMock.getExercise).toHaveBeenCalledWith("ex-1");
    // Ni consigne ni dosage : le serveur les reprend de la source, images de consigne comprises.
    expect(apiMock.duplicateExercise).toHaveBeenCalledExactlyOnceWith("ex-1", {
      title: "Tractions (variante)",
    });
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: exerciseKeys.all });
  });

  // Depuis une séance, la variante grave les ajustements du coach, pas le défaut de la source.
  it("grave le dosage fourni plutôt que celui de la source", async () => {
    apiMock.getExercise.mockResolvedValue(source);
    apiMock.duplicateExercise.mockResolvedValue({ ...source, id: "ex-2" });
    const { wrapper } = renderWithQueryClient();
    const adjusted = [{ id: "b-seance" }] as unknown as ExerciseDto["blocks"];

    const { result } = renderHook(() => useDuplicateExercise(), { wrapper });
    await result.current.mutateAsync({ exerciseId: "ex-1", suffix: "(v)", blocks: adjusted });

    expect(apiMock.duplicateExercise).toHaveBeenCalledWith("ex-1", {
      title: "Tractions (v)",
      blocks: adjusted,
    });
  });

  it("ne duplique rien quand la source est introuvable", async () => {
    apiMock.getExercise.mockRejectedValue(new Error("404"));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useDuplicateExercise(), { wrapper });
    await expect(result.current.mutateAsync({ exerciseId: "ex-1", suffix: "(v)" })).rejects.toThrow(
      "404",
    );

    expect(apiMock.duplicateExercise).not.toHaveBeenCalled();
  });
});
