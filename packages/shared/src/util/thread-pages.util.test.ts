import { describe, expect, it, vi } from "vitest";
import type { MessageDto, MessagePageDto } from "../dto/message.schema";
import type { MessagePages } from "./message-pages.util";
import { createSignedUrlKeeper } from "./signed-url-keeper.util";
import {
  createThreadPages,
  isOlderPageFresh,
  OLDER_PAGE_MAX_AGE_MS,
  olderPageOutcome,
} from "./thread-pages.util";

const T0 = Date.UTC(2026, 10, 27, 12, 0, 0);

const text = (id: string) => ({ id, media: null }) as MessageDto;
const audio = (id: string, url: string) =>
  ({ id, media: { url, fileName: "note.m4a", mimeType: "audio/mp4" } }) as MessageDto;
const page = (items: MessageDto[], nextCursor: string | null = null): MessagePageDto => ({
  items,
  nextCursor,
});

describe("isOlderPageFresh", () => {
  const keeper = createSignedUrlKeeper();

  it("relit une page dont on ignore quand elle a été lue", () => {
    expect(isOlderPageFresh(page([text("m1")]), undefined, keeper, T0)).toBe(false);
  });

  it("rend une page récente sans média", () => {
    expect(isOlderPageFresh(page([text("m1")]), T0 - 1000, keeper, T0)).toBe(true);
  });

  it("relit une page lue il y a trop longtemps, même sans média", () => {
    const readAt = T0 - OLDER_PAGE_MAX_AGE_MS;
    expect(isOlderPageFresh(page([text("m1")]), readAt, keeper, T0)).toBe(false);
  });

  // L'horloge a reculé (#867) : l'âge ne dit plus rien.
  it("relit une page lue « dans le futur »", () => {
    expect(isOlderPageFresh(page([text("m1")]), T0 + 1000, keeper, T0)).toBe(false);
  });

  it("rend une page dont chaque média porte l'URL que la table garde ouvrable", () => {
    const fresh = createSignedUrlKeeper();
    fresh.keep("m2", "https://s3.test/a?sig=1", T0 - 1000);
    expect(isOlderPageFresh(page([audio("m2", "https://s3.test/a?sig=1")]), T0, fresh, T0)).toBe(
      true,
    );
  });

  it("relit une page dont un média n'est plus garanti par la table", () => {
    const expiring = createSignedUrlKeeper();
    expiring.keep("m2", "https://s3.test/a?sig=1", T0 - 290_000);
    const media = page([text("m1"), audio("m2", "https://s3.test/a?sig=1")]);
    expect(isOlderPageFresh(media, T0 - 1000, expiring, T0)).toBe(false);
  });

  // Le cache tient une URL que la table a remplacée : c'est la page qu'il faut relire.
  it("relit une page dont un média porte une autre URL que celle de la table", () => {
    const replaced = createSignedUrlKeeper();
    replaced.keep("m2", "https://s3.test/a?sig=2", T0 - 1000);
    const media = page([audio("m2", "https://s3.test/a?sig=1")]);
    expect(isOlderPageFresh(media, T0 - 1000, replaced, T0)).toBe(false);
  });
});

function setup() {
  let now = T0;
  const keeper = createSignedUrlKeeper();
  const api = {
    getMessagePage: vi.fn().mockResolvedValue(page([])),
    getMessagesSince: vi.fn().mockResolvedValue(page([])),
  };
  let data: MessagePages | undefined;
  const threadPagesOptions = createThreadPages(keeper, () => now);
  const options = (as: "coach" | "athlete" | null = null) =>
    threadPagesOptions(api, "c1", as, () => data);
  return {
    api,
    options,
    setCache: (next: MessagePages | undefined) => {
      data = next;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createThreadPages", () => {
  it("lit la page la plus récente sans curseur au premier chargement", async () => {
    const { api, options } = setup();

    await options("coach").queryFn({ pageParam: null });

    expect(api.getMessagePage).toHaveBeenCalledExactlyOnceWith("c1", null, "coach");
    expect(api.getMessagesSince).not.toHaveBeenCalled();
  });

  /**
   * Relue comme « les 50 plus récents », elle perdait par le bas ce qui arrivait en haut, et les
   * pages d'avant glissaient d'autant : relue depuis sa frontière, elle garde son curseur.
   */
  it("relit la page la plus récente depuis sa frontière", async () => {
    const { api, options, setCache } = setup();
    setCache({
      pages: [page([text("m3")], "c-m3"), page([text("m1")])],
      pageParams: [null, "c-m3"],
    });

    await options().queryFn({ pageParam: null });

    expect(api.getMessagesSince).toHaveBeenCalledExactlyOnceWith("c1", "c-m3", null);
    expect(api.getMessagePage).not.toHaveBeenCalled();
  });

  it("relit sans frontière un fil qui tient en une page", async () => {
    const { api, options, setCache } = setup();
    setCache({ pages: [page([text("m1")])], pageParams: [null] });

    await options().queryFn({ pageParam: null });

    expect(api.getMessagePage).toHaveBeenCalledExactlyOnceWith("c1", null, null);
  });

  it("charge une page d'avant absente du cache par son curseur", async () => {
    const { api, options } = setup();
    const older = page([text("m1")]);
    api.getMessagePage.mockResolvedValueOnce(older);

    expect(await options().queryFn({ pageParam: "c-m3" })).toBe(older);
    expect(api.getMessagePage).toHaveBeenCalledExactlyOnceWith("c1", "c-m3", null);
  });

  // Le coût du sondage ne grandit plus avec la remontée (#782).
  it("rend telle quelle, sans requête, une page d'avant lue récemment", async () => {
    const { api, options, setCache, advance } = setup();
    const older = page([text("m1")]);
    api.getMessagePage.mockResolvedValueOnce(older);
    await options().queryFn({ pageParam: "c-m3" });
    setCache({ pages: [page([text("m3")], "c-m3"), older], pageParams: [null, "c-m3"] });
    advance(10_000);

    expect(await options().queryFn({ pageParam: "c-m3" })).toBe(older);
    expect(api.getMessagePage).toHaveBeenCalledOnce();
  });

  it("relit une page d'avant devenue trop vieille", async () => {
    const { api, options, setCache, advance } = setup();
    const older = page([text("m1")]);
    api.getMessagePage.mockResolvedValueOnce(older);
    await options().queryFn({ pageParam: "c-m3" });
    setCache({ pages: [page([text("m3")], "c-m3"), older], pageParams: [null, "c-m3"] });
    advance(OLDER_PAGE_MAX_AGE_MS);

    await options().queryFn({ pageParam: "c-m3" });

    expect(api.getMessagePage).toHaveBeenCalledTimes(2);
  });

  it("ne tient pas pour lue sous un titre une page lue sous l'autre", async () => {
    const { api, options, setCache } = setup();
    const older = page([text("m1")]);
    api.getMessagePage.mockResolvedValueOnce(older);
    await options("coach").queryFn({ pageParam: "c-m3" });
    setCache({ pages: [page([text("m3")], "c-m3"), older], pageParams: [null, "c-m3"] });

    await options("athlete").queryFn({ pageParam: "c-m3" });

    expect(api.getMessagePage).toHaveBeenLastCalledWith("c1", "c-m3", "athlete");
    expect(api.getMessagePage).toHaveBeenCalledTimes(2);
  });

  it("pose le fil à plat et le curseur de la page d'avant", () => {
    const { options } = setup();
    const { initialPageParam, getNextPageParam, select } = options();

    expect(initialPageParam).toBeNull();
    expect(getNextPageParam(page([], "c-m1"))).toBe("c-m1");
    const data = { pages: [page([text("m2")], "c-m2"), page([text("m1")])], pageParams: [] };
    expect(select(data).map(({ id }) => id)).toEqual(["m1", "m2"]);
  });
});

describe("olderPageOutcome", () => {
  const thread = (...ids: string[]) => ids.map((id) => ({ id }));

  it("dit l'échec de la page d'avant", () => {
    expect(
      olderPageOutcome("m3", { data: thread("m3"), hasNextPage: true, isFetchNextPageError: true }),
    ).toBe("failed");
  });

  it("dit la page arrivée quand la tête du fil a changé", () => {
    expect(
      olderPageOutcome("m3", {
        data: thread("m1", "m3"),
        hasNextPage: true,
        isFetchNextPageError: false,
      }),
    ).toBe("loaded");
  });

  it("dit la remontée finie quand il n'y a plus rien d'avant", () => {
    expect(
      olderPageOutcome("m3", {
        data: thread("m3"),
        hasNextPage: false,
        isFetchNextPageError: false,
      }),
    ).toBe("loaded");
  });

  // Une relecture lancée pendant qu'elle était en route l'a annulée, sans erreur.
  it("dit la page interrompue quand rien n'a changé", () => {
    expect(
      olderPageOutcome("m3", {
        data: thread("m3"),
        hasNextPage: true,
        isFetchNextPageError: false,
      }),
    ).toBe("interrupted");
  });
});
