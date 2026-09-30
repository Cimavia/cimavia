import type { CreateSessionInput, SessionDto } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionKeys } from "@/feature/library/api";
import { renderWithQueryClient } from "../../../../test/query";
import {
  useDeleteSession,
  useReloadSessionExercise,
  useSaveSession,
  useSession,
  useSessions,
} from "./useSessions";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    reloadSessionExercise: vi.fn(),
  },
}));

// Les appels sont remplacés, les clés restent les VRAIES.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  ...apiMock,
}));

const session = { id: "s-1", title: "Force" } as SessionDto;
const input = {
  title: "Force max",
  notes: "À jeun",
  exercises: [{ exerciseId: "ex-1" }],
} as unknown as CreateSessionInput;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Le client de test a `gcTime: 0` : une entrée posée sans observateur disparaît aussitôt, son état
 * d'invalidation avec elle. On observe donc la demande d'invalidation, sur la racine des séances.
 */
function spyInvalidate() {
  const client = renderWithQueryClient();
  const invalidate = vi.spyOn(client.queryClient, "invalidateQueries");
  return { ...client, invalidate };
}

describe("useSessions", () => {
  it("rend les séances du coach", async () => {
    apiMock.listSessions.mockResolvedValue([session]);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useSessions(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([session]));
  });
});

describe("useSession", () => {
  it("charge la séance désignée", async () => {
    apiMock.getSession.mockResolvedValue(session);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useSession("s-1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(session));
    expect(apiMock.getSession).toHaveBeenCalledWith("s-1");
  });

  it("ne part pas sans id", () => {
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useSession(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiMock.getSession).not.toHaveBeenCalled();
  });
});

describe("useSaveSession", () => {
  it("crée la séance quand il n'y en a pas encore", async () => {
    apiMock.createSession.mockResolvedValue(session);
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useSaveSession(), { wrapper });
    await act(() => result.current.save({ session: null, input }));

    expect(apiMock.createSession).toHaveBeenCalledExactlyOnceWith(input);
    expect(apiMock.updateSession).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
  });

  // Le PUT remplace tout : un champ oublié serait EFFACÉ côté serveur.
  it("remplace la séance existante par sa représentation complète", async () => {
    apiMock.updateSession.mockResolvedValue(session);
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useSaveSession(), { wrapper });
    await act(() => result.current.save({ session, input }));

    expect(apiMock.updateSession).toHaveBeenCalledExactlyOnceWith("s-1", {
      title: "Force max",
      notes: "À jeun",
      exercises: input.exercises,
    });
    expect(apiMock.createSession).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
  });

  // Sans note, le PUT dit explicitement « pas de note » : omise, elle ne serait pas effacée.
  it("envoie une note absente comme null", async () => {
    apiMock.updateSession.mockResolvedValue(session);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useSaveSession(), { wrapper });
    await act(() =>
      result.current.save({ session, input: { title: "Force", exercises: [] } as never }),
    );

    expect(apiMock.updateSession).toHaveBeenCalledWith("s-1", {
      title: "Force",
      notes: null,
      exercises: [],
    });
  });

  it("expose l'enregistrement en cours puis l'erreur", async () => {
    let reject: (error: Error) => void = () => {};
    apiMock.createSession.mockReturnValue(
      new Promise((_, r) => {
        reject = r;
      }),
    );
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useSaveSession(), { wrapper });
    expect(result.current.isSaving).toBe(false);
    let saving: Promise<unknown> = Promise.resolve();
    act(() => {
      saving = result.current.save({ session: null, input }).catch(() => {});
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));
    reject(new Error("500"));
    await act(() => saving);

    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.error?.message).toBe("500");
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useDeleteSession", () => {
  it("supprime puis invalide les séances", async () => {
    apiMock.deleteSession.mockResolvedValue(undefined);
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useDeleteSession(), { wrapper });
    await act(() => result.current.mutateAsync("s-1"));

    expect(apiMock.deleteSession).toHaveBeenCalledWith("s-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
  });
});

describe("useReloadSessionExercise", () => {
  it("recharge l'exercice de CETTE séance puis invalide les séances", async () => {
    apiMock.reloadSessionExercise.mockResolvedValue(session);
    const { wrapper, invalidate } = spyInvalidate();

    const { result } = renderHook(() => useReloadSessionExercise("s-1"), { wrapper });
    await act(() => result.current.mutateAsync("se-1"));

    expect(apiMock.reloadSessionExercise).toHaveBeenCalledExactlyOnceWith("s-1", "se-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
  });
});
