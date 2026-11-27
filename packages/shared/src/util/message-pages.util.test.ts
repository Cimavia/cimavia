import { describe, expect, it } from "vitest";
import { type MessageDto, MessageType } from "../dto/message.schema";
import { olderPageCursor, shouldLoadOlderPage, threadOfPages } from "./message-pages.util";

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
