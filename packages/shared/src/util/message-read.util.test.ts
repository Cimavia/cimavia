import { describe, expect, it } from "vitest";
import type { MessageDto } from "../dto/message.schema";
import { createReadMarker, lastUnreadIncomingId } from "./message-read.util";

const READ_AT = "2026-09-27T10:00:00.000Z";

function message(id: string, senderId: string, readAt: string | null): MessageDto {
  return { id, senderId, readAt } as MessageDto;
}

describe("lastUnreadIncomingId", () => {
  it("désigne le DERNIER entrant non lu, pas le premier", () => {
    const thread = [message("m1", "coach", null), message("m2", "coach", null)];
    expect(lastUnreadIncomingId(thread, "me")).toBe("m2");
  });

  // Le cas de #305 : m1 marqué entre-temps, m2 arrivé après. L'id change, l'écran le voit.
  it("change quand un second entrant arrive après un premier marquage", () => {
    const before = [message("m1", "coach", null)];
    const after = [message("m1", "coach", READ_AT), message("m2", "coach", null)];
    expect(lastUnreadIncomingId(before, "me")).toBe("m1");
    expect(lastUnreadIncomingId(after, "me")).toBe("m2");
  });

  it("ignore ses propres messages, même non lus", () => {
    const thread = [message("m1", "coach", null), message("m2", "me", null)];
    expect(lastUnreadIncomingId(thread, "me")).toBe("m1");
  });

  it("rend null quand tout l'entrant est lu", () => {
    const thread = [message("m1", "coach", READ_AT), message("m2", "me", null)];
    expect(lastUnreadIncomingId(thread, "me")).toBeNull();
  });

  it("rend null sur un fil vide", () => {
    expect(lastUnreadIncomingId([], "me")).toBeNull();
  });

  // Sans session, tout message paraîtrait entrant — y compris les siens.
  it("rend null tant qu'on ne sait pas qui lit", () => {
    expect(lastUnreadIncomingId([message("m1", "coach", null)], null)).toBeNull();
  });
});

describe("createReadMarker", () => {
  it("laisse partir un id une seule fois", () => {
    const marker = createReadMarker();
    expect(marker.claim("m1")).toBe(true);
    expect(marker.claim("m1")).toBe(false);
  });

  it("laisse partir chaque nouvel id", () => {
    const marker = createReadMarker();
    marker.claim("m1");
    expect(marker.claim("m2")).toBe(true);
  });

  it("ne fait jamais partir null", () => {
    expect(createReadMarker().claim(null)).toBe(false);
  });

  it("refait partir un id relâché après un échec", () => {
    const marker = createReadMarker();
    marker.claim("m1");
    marker.release("m1");
    expect(marker.claim("m1")).toBe(true);
  });

  // L'échec d'un marquage supplanté ne doit pas faire repartir le suivant, déjà en route.
  it("ignore le relâchement d'un id supplanté", () => {
    const marker = createReadMarker();
    marker.claim("m1");
    marker.claim("m2");
    marker.release("m1");
    expect(marker.claim("m2")).toBe(false);
  });
});
