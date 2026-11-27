import type { MessageDto } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOlderMessages } from "./useOlderMessages";

type Query = Parameters<typeof useOlderMessages>[0];

const message = (id: string) => ({ id }) as MessageDto;

function query(overrides: Partial<Query> = {}): Query {
  return {
    data: [message("m3")],
    fetchNextPage: vi.fn().mockResolvedValue({ isFetchNextPageError: false, hasNextPage: false }),
    hasNextPage: true,
    isFetching: false,
    isFetchingNextPage: false,
    ...overrides,
  } as Query;
}

describe("useOlderMessages (#77)", () => {
  it("charge la page d'avant quand le lecteur arrive en tête", () => {
    const thread = query();
    const { result } = renderHook(() => useOlderMessages(thread));

    act(() => result.current.loadMore());

    expect(thread.fetchNextPage).toHaveBeenCalledOnce();
  });

  // La liste rappelle `onEndReached` à chaque fin de défilement près de la tête.
  it("ne redemande pas pendant qu'une page est en route", () => {
    const thread = query({ isFetchingNextPage: true });
    const { result } = renderHook(() => useOlderMessages(thread));

    act(() => result.current.loadMore());

    expect(thread.fetchNextPage).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
  });

  it("s'arrête au début du fil", () => {
    const thread = query({ hasNextPage: false });
    const { result } = renderHook(() => useOlderMessages(thread));

    act(() => result.current.loadMore());

    expect(thread.fetchNextPage).not.toHaveBeenCalled();
  });

  /**
   * Un sondage réussi efface l'erreur de la requête sans recharger la page d'avant, et la liste ne
   * rappelle pas `onEndReached` : lue de là, l'erreur disparaissait, et le lecteur resté en tête
   * n'avait plus ni bouton, ni page.
   */
  it("retient l'échec jusqu'à « Réessayer », sans repartir seule entre-temps", async () => {
    const thread = query({
      fetchNextPage: vi.fn().mockResolvedValue({ isFetchNextPageError: true }),
    });
    const { result, rerender } = renderHook(({ q }) => useOlderMessages(q), {
      initialProps: { q: thread },
    });

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.failed).toBe(true));

    rerender({ q: { ...thread } });
    act(() => result.current.loadMore());
    expect(result.current.failed).toBe(true);
    expect(thread.fetchNextPage).toHaveBeenCalledOnce();

    vi.mocked(thread.fetchNextPage).mockResolvedValue({
      isFetchNextPageError: false,
      hasNextPage: false,
    } as never);
    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);
    expect(thread.fetchNextPage).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.failed).toBe(false));
  });

  /**
   * Une relecture lancée pendant que la page était en route — l'invalidation d'un envoi — l'annule
   * sans erreur, et la liste ne rappelle pas `onEndReached` : la remontée restait figée, sans
   * indicateur ni « Réessayer ».
   */
  it("redemande une page interrompue, une fois la relecture finie", async () => {
    const interrupted = { isFetchNextPageError: false, hasNextPage: true, data: [message("m3")] };
    const thread = query({ fetchNextPage: vi.fn().mockResolvedValue(interrupted) });
    const { result, rerender } = renderHook(({ q }) => useOlderMessages(q), {
      initialProps: { q: thread },
    });

    act(() => result.current.loadMore());
    // La relecture qui l'annule tourne encore : rien ne repart.
    rerender({ q: { ...thread, isFetching: true } });
    await act(() => Promise.resolve());
    expect(thread.fetchNextPage).toHaveBeenCalledOnce();

    vi.mocked(thread.fetchNextPage).mockResolvedValue({
      isFetchNextPageError: false,
      hasNextPage: false,
    } as never);
    rerender({ q: { ...thread, isFetching: false } });
    await waitFor(() => expect(thread.fetchNextPage).toHaveBeenCalledTimes(2));
    expect(result.current.failed).toBe(false);
  });
});
