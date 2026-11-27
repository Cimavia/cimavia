import type { MessageDto } from "@cmv/shared";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type OlderMessages, useOlderMessages } from "./useOlderMessages";

/**
 * jsdom n'a pas d'`IntersectionObserver` : celui-ci retient le rappel du DERNIER observateur, et le
 * test dit ce qu'il mesure — un repère observé à neuf se signale d'emblée, comme le vrai.
 */
let intersect: (visible: boolean) => void = () => undefined;
let observers = 0;

class FakeIntersectionObserver {
  constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    observers += 1;
    intersect = (visible) => act(() => this.callback([{ isIntersecting: visible }]));
  }
  disconnect() {
    intersect = () => undefined;
  }
}

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

let older: OlderMessages;

function Harness({ thread, hold }: Readonly<{ thread: Query; hold: () => () => void }>) {
  older = useOlderMessages(thread, hold);
  return <div ref={older.sentinelRef} />;
}

function setup(thread: Query) {
  const restore = vi.fn();
  const hold = vi.fn(() => restore);
  const view = render(<Harness thread={thread} hold={hold} />);
  const rerender = (next: Query) => view.rerender(<Harness thread={next} hold={hold} />);
  return { hold, restore, rerender };
}

beforeEach(() => {
  observers = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOlderMessages (#77)", () => {
  it("ne charge rien tant que le lecteur n'est pas arrivé en tête", () => {
    const thread = query();
    setup(thread);
    expect(thread.fetchNextPage).not.toHaveBeenCalled();
  });

  it("charge la page d'avant quand le repère entre à l'écran, position retenue d'abord", () => {
    const thread = query();
    const { hold } = setup(thread);

    intersect(true);

    expect(hold).toHaveBeenCalledOnce();
    expect(thread.fetchNextPage).toHaveBeenCalledOnce();
    expect(hold.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(thread.fetchNextPage).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("remet le lecteur en place quand la page s'est ajoutée en tête, et seulement alors", () => {
    const thread = query();
    const { restore, rerender } = setup(thread);
    intersect(true);

    // Un sondage : le bas change, la tête non.
    rerender(query({ data: [message("m3"), message("m4")], isFetchingNextPage: true }));
    expect(restore).not.toHaveBeenCalled();

    rerender(query({ data: [message("m1"), message("m2"), message("m3"), message("m4")] }));
    expect(restore).toHaveBeenCalledOnce();
  });

  it("ne redemande pas pendant qu'une page est en route", () => {
    const thread = query({ isFetchingNextPage: true });
    setup(thread);
    intersect(true);
    expect(thread.fetchNextPage).not.toHaveBeenCalled();
  });

  /**
   * La page arrivée repousse le repère hors de l'écran, mais l'effet qui le saurait tourne avant
   * que l'observateur ne le mesure : relue d'un état, la visibilité d'avant redemandait une page
   * de trop à chaque remontée.
   */
  it("ne redemande rien sur un repère vu avant l'arrivée de la page", () => {
    const { rerender } = setup(query());
    intersect(true);
    rerender(query({ isFetchingNextPage: true }));

    const next = query({ data: [message("m1"), message("m3")] });
    rerender(next);
    expect(next.fetchNextPage).not.toHaveBeenCalled();
  });

  // Un fil de messages courts : la page arrivée ne repousse pas le repère hors de l'écran.
  it("observe le repère à neuf à chaque nouvelle tête, et redemande s'il est resté à l'écran", () => {
    const { rerender } = setup(query());
    intersect(true);
    expect(observers).toBe(1);

    const next = query({ data: [message("m1"), message("m3")] });
    rerender(next);
    expect(observers).toBe(2);

    intersect(true);
    expect(next.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("s'arrête au début du fil", () => {
    const thread = query({ hasNextPage: false });
    setup(thread);
    intersect(true);
    expect(thread.fetchNextPage).not.toHaveBeenCalled();
  });

  /**
   * Un sondage réussi efface l'erreur de la requête sans recharger la page d'avant : lue de là,
   * l'erreur disparaissait, et le lecteur resté en tête n'avait plus ni bouton, ni page.
   */
  it("retient l'échec jusqu'à « Réessayer », sans repartir seule entre-temps", async () => {
    const thread = query({
      fetchNextPage: vi.fn().mockResolvedValue({ isFetchNextPageError: true }),
    });
    const { hold, restore, rerender } = setup(thread);
    intersect(true);
    await waitFor(() => expect(older.failed).toBe(true));

    // Le sondage suivant, réussi : même tête, l'échec reste dit.
    rerender({ ...thread, data: [message("m3"), message("m4")] });
    intersect(true);
    expect(older.failed).toBe(true);
    expect(thread.fetchNextPage).toHaveBeenCalledOnce();

    act(() => older.retry());
    expect(older.failed).toBe(false);
    expect(hold).toHaveBeenCalledTimes(2);
    expect(thread.fetchNextPage).toHaveBeenCalledTimes(2);
    expect(restore).not.toHaveBeenCalled();
  });

  // La position retenue avant un échec ne vaut pas pour la tête que changerait un autre rendu.
  it("oublie la position retenue quand la page n'est pas arrivée", async () => {
    const thread = query({
      fetchNextPage: vi.fn().mockResolvedValue({ isFetchNextPageError: true }),
    });
    const { restore, rerender } = setup(thread);
    intersect(true);
    await waitFor(() => expect(older.failed).toBe(true));

    rerender({ ...thread, data: [message("m2"), message("m3")] });
    expect(restore).not.toHaveBeenCalled();
  });

  /**
   * Une relecture lancée pendant que la page était en route — l'invalidation d'un envoi — l'annule
   * sans erreur. Le repère, resté à l'écran, ne se manifestait plus : la remontée restait figée,
   * sans indicateur ni « Réessayer ».
   */
  it("redemande une page interrompue, une fois la relecture finie", async () => {
    const interrupted = { isFetchNextPageError: false, hasNextPage: true, data: [message("m3")] };
    const thread = query({ fetchNextPage: vi.fn().mockResolvedValue(interrupted) });
    const { restore, rerender } = setup(thread);
    intersect(true);
    // La relecture qui l'annule est partie : la page rend la main pendant qu'elle tourne.
    rerender({ ...thread, isFetching: true });
    await act(() => Promise.resolve());

    // Rien ne repart tant qu'elle tourne, et la position retenue est oubliée.
    rerender({ ...thread, data: [message("m2"), message("m3")], isFetching: true });
    expect(restore).not.toHaveBeenCalled();
    expect(observers).toBe(2);

    rerender({ ...thread, data: [message("m2"), message("m3")], isFetching: false });
    expect(observers).toBe(3);
    intersect(true);
    expect(thread.fetchNextPage).toHaveBeenCalledTimes(2);
    expect(older.failed).toBe(false);
  });

  it("ne redemande rien d'une page interrompue si le repère a quitté l'écran", async () => {
    const interrupted = { isFetchNextPageError: false, hasNextPage: true, data: [message("m3")] };
    const thread = query({ fetchNextPage: vi.fn().mockResolvedValue(interrupted) });
    const { rerender } = setup(thread);
    intersect(true);
    await act(() => Promise.resolve());

    rerender({ ...thread, isFetching: false });
    intersect(false);
    expect(thread.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("ne casse rien sans IntersectionObserver", () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
    const thread = query();
    setup(thread);
    expect(thread.fetchNextPage).not.toHaveBeenCalled();
  });
});
