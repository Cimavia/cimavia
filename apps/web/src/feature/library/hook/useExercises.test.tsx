import { type ExerciseDto, LibraryScope } from "@cmv/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ExerciseFilters, exerciseKeys } from "@/feature/library/api";
import { renderWithQueryClient } from "../../../../test/query";
import {
  useChangeExerciseAccess,
  useDeleteExercise,
  useDuplicateExercise,
  useExercise,
  useExercises,
  useExerciseTags,
} from "./useExercises";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    listExercises: vi.fn(),
    changeExerciseAccess: vi.fn(),
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

  // Chaque frappe est une clé neuve : sans la liste précédente, le tableau se démonterait le temps
  // de la réponse, et sa sélection avec.
  it("garde la liste précédente pendant qu'une recherche se lit", async () => {
    apiMock.listExercises.mockResolvedValueOnce([source]).mockReturnValue(new Promise(() => {}));
    const { wrapper } = renderWithQueryClient();
    const { result, rerender } = renderHook((filters: ExerciseFilters) => useExercises(filters), {
      wrapper,
      initialProps: {},
    });
    await waitFor(() => expect(result.current.data).toEqual([source]));

    rerender({ search: "trac" });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data).toEqual([source]);
  });

  // Gardée, une liste vide ferait dire « aucun résultat » à la recherche suivante, et proposer de
  // créer ce qui existe peut-être.
  it("ne garde pas une liste vide pendant qu'une recherche se lit", async () => {
    apiMock.listExercises.mockResolvedValueOnce([]).mockReturnValue(new Promise(() => {}));
    const { wrapper } = renderWithQueryClient();
    const { result, rerender } = renderHook((filters: ExerciseFilters) => useExercises(filters), {
      wrapper,
      initialProps: { search: "xyz" },
    });
    await waitFor(() => expect(result.current.data).toEqual([]));

    rerender({ search: "Tractions" });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("ne montre pas la liste d'une autre portée sous la nouvelle", async () => {
    apiMock.listExercises.mockResolvedValueOnce([source]).mockReturnValue(new Promise(() => {}));
    const { wrapper } = renderWithQueryClient();
    const { result, rerender } = renderHook((filters: ExerciseFilters) => useExercises(filters), {
      wrapper,
      initialProps: {},
    });
    await waitFor(() => expect(result.current.data).toEqual([source]));

    rerender({ scope: LibraryScope.SHARED });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(result.current.data).toBeUndefined();
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
  const shown = { id: "ex-1", updatedAt: "2026-10-12T08:00:00.000Z" };

  it("supprime à la version affichée, puis invalide toute la bibliothèque d'exercices", async () => {
    apiMock.deleteExercise.mockResolvedValue(undefined);
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useDeleteExercise(), { wrapper });
    await result.current.mutateAsync(shown);

    expect(apiMock.deleteExercise).toHaveBeenCalledWith("ex-1", {
      expectedUpdatedAt: shown.updatedAt,
    });
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: exerciseKeys.all });
  });

  it("n'invalide rien quand la suppression échoue", async () => {
    apiMock.deleteExercise.mockRejectedValue(new Error("500"));
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useDeleteExercise(), { wrapper });
    await expect(result.current.mutateAsync(shown)).rejects.toThrow("500");

    expect(invalidate).not.toHaveBeenCalled();
  });

  // L'exercice est AFFICHÉ — son constructeur l'observe : sans observateur, l'invalidation ne le
  // relirait pas de toute façon, et le test ne prouverait rien.
  it("oublie l'exercice supprimé, même affiché, plutôt que de le relire", async () => {
    apiMock.getExercise.mockResolvedValue(source);
    apiMock.deleteExercise.mockResolvedValue(undefined);
    const { wrapper, queryClient } = renderWithQueryClient();
    const shownExercise = renderHook(() => useExercise("ex-1"), { wrapper });
    await waitFor(() => expect(shownExercise.result.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useDeleteExercise(), { wrapper });
    await result.current.mutateAsync(shown);

    expect(queryClient.getQueryState(exerciseKeys.detail("ex-1"))).toBeUndefined();
    expect(apiMock.getExercise).toHaveBeenCalledOnce();
  });
});

describe("useDuplicateExercise", () => {
  it("demande au serveur une copie de la source, titre suffixé", async () => {
    apiMock.duplicateExercise.mockResolvedValue({ ...source, id: "ex-2" });
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useDuplicateExercise(), { wrapper });
    const created = await result.current.mutateAsync({ source, suffix: "(variante)" });

    expect(created.id).toBe("ex-2");
    // Ni consigne ni dosage : le serveur les reprend de la source, images de consigne comprises.
    expect(apiMock.duplicateExercise).toHaveBeenCalledExactlyOnceWith("ex-1", {
      title: "Tractions (variante)",
    });
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: exerciseKeys.all });
  });

  // Depuis une séance, la variante grave les ajustements du coach, pas le défaut de la source.
  it("grave le dosage fourni plutôt que celui de la source", async () => {
    apiMock.duplicateExercise.mockResolvedValue({ ...source, id: "ex-2" });
    const { wrapper } = renderWithQueryClient();
    const adjusted = [{ id: "b-seance" }] as unknown as ExerciseDto["blocks"];

    const { result } = renderHook(() => useDuplicateExercise(), { wrapper });
    await result.current.mutateAsync({ source, suffix: "(v)", blocks: adjusted });

    expect(apiMock.duplicateExercise).toHaveBeenCalledWith("ex-1", {
      title: "Tractions (v)",
      blocks: adjusted,
    });
  });
});

describe("useChangeExerciseAccess", () => {
  const input = { ids: ["ex-1"], changes: [{ organizationId: "org-f", level: null }] };

  it("envoie les seuls changements, puis invalide toute la bibliothèque d'exercices", async () => {
    apiMock.changeExerciseAccess.mockResolvedValue([]);
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useChangeExerciseAccess(), { wrapper });
    await result.current.mutateAsync(input);

    expect(apiMock.changeExerciseAccess).toHaveBeenCalledExactlyOnceWith(input);
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: exerciseKeys.all });
  });

  it("n'invalide rien quand le changement est refusé", async () => {
    apiMock.changeExerciseAccess.mockRejectedValue(new Error("409"));
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useChangeExerciseAccess(), { wrapper });
    await expect(result.current.mutateAsync(input)).rejects.toThrow("409");

    expect(invalidate).not.toHaveBeenCalled();
  });
});
