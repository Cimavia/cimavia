import { describe, expect, it } from "vitest";
import { type MessageDto, MessageType } from "../dto/message.schema";
import {
  olderPageCursor,
  refreshNewestPage,
  shouldLoadOlderPage,
  threadOfPages,
} from "./message-pages.util";

function message(id: string): MessageDto {
  return {
    id,
    conversationId: "c1",
    senderId: "u1",
    type: MessageType.TEXT,
    content: id,
    media: null,
    scheduledSessionId: null,
    sessionFeedbackId: null,
    attachment: null,
    createdAt: "2026-11-27T10:00:00.000Z",
  };
}

const ids = (messages: readonly MessageDto[]) => messages.map(({ id }) => id);

describe("threadOfPages", () => {
  it("remet les pages dans l'ordre de lecture, la plus ancienne en tête", () => {
    const data = {
      pages: [
        { items: [message("m5"), message("m6")], nextCursor: "c-m5" },
        { items: [message("m3"), message("m4")], nextCursor: "c-m3" },
        { items: [message("m1"), message("m2")], nextCursor: null },
      ],
      pageParams: [null, "c-m5", "c-m3"],
    };
    expect(ids(threadOfPages(data))).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
  });

  it("ne réordonne pas le cache qu'on lui passe", () => {
    const pages = [
      { items: [message("m2")], nextCursor: "c-m2" },
      { items: [message("m1")], nextCursor: null },
    ];
    threadOfPages({ pages, pageParams: [null, "c-m2"] });
    expect(ids(pages[0]?.items ?? [])).toEqual(["m2"]);
  });

  it("rend un fil vide pour une conversation sans message", () => {
    expect(threadOfPages({ pages: [{ items: [], nextCursor: null }], pageParams: [null] })).toEqual(
      [],
    );
  });
});

describe("olderPageCursor", () => {
  it("rend le curseur de la page d'avant", () => {
    expect(olderPageCursor({ items: [message("m2")], nextCursor: "c-m2" })).toBe("c-m2");
  });

  it("rend null une fois tout le fil chargé", () => {
    expect(olderPageCursor({ items: [message("m1")], nextCursor: null })).toBeNull();
  });
});

describe("shouldLoadOlderPage", () => {
  const idle = { hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false };

  it("laisse partir la page d'avant quand rien ne s'y oppose", () => {
    expect(shouldLoadOlderPage(idle)).toBe(true);
  });

  it("s'arrête au début du fil", () => {
    expect(shouldLoadOlderPage({ ...idle, hasNextPage: false })).toBe(false);
  });

  it("ne redemande pas une page déjà en route", () => {
    expect(shouldLoadOlderPage({ ...idle, isFetchingNextPage: true })).toBe(false);
  });

  it("ne repart pas seule après un échec", () => {
    expect(shouldLoadOlderPage({ ...idle, isFetchNextPageError: true })).toBe(false);
  });
});

describe("refreshNewestPage", () => {
  const page = (idList: string[], nextCursor: string | null) => ({
    items: idList.map(message),
    nextCursor,
  });

  it("rend la page lue telle quelle à la première lecture", () => {
    const fetched = page(["m3", "m4"], "c-m3");
    expect(refreshNewestPage(undefined, fetched)).toBe(fetched);
  });

  /**
   * Deux messages arrivés : la page relue (les 3 plus récents) a perdu m3 et m4 par le bas. Ils
   * restent, et la frontière avec la page d'avant ne bouge pas.
   */
  it("absorbe ce qui est arrivé, et garde sa frontière avec la page d'avant", () => {
    const refreshed = refreshNewestPage(
      page(["m3", "m4", "m5"], "c-m3"),
      page(["m5", "m6", "m7"], "c-m5"),
    );
    expect(ids(refreshed.items)).toEqual(["m3", "m4", "m5", "m6", "m7"]);
    expect(refreshed.nextCursor).toBe("c-m3");
  });

  it("prend de la relecture les messages qu'elle porte encore — leurs URLs sont les fraîches", () => {
    const fresh = { ...message("m4"), content: "relu" };
    const refreshed = refreshNewestPage(page(["m3", "m4"], "c-m3"), {
      items: [message("m3"), fresh],
      nextCursor: "c-m3",
    });
    expect(refreshed.items[1]).toBe(fresh);
  });

  it("repart de la relecture quand elle ne recoupe plus la page d'avant : rien de recousu à trou", () => {
    const fetched = page(["m60", "m61"], "c-m60");
    expect(refreshNewestPage(page(["m3", "m4"], "c-m3"), fetched)).toBe(fetched);
  });

  it("rend la page lue quand le fil était vide", () => {
    const fetched = page(["m1"], null);
    expect(refreshNewestPage(page([], null), fetched)).toBe(fetched);
  });
});
