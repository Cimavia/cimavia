import { describe, expect, it } from "vitest";
import type { MessageDto } from "../dto/message.schema";
import { createReadMarker, lastUnreadIncomingId, readMarkOf } from "./message-read.util";

const at = (minute: number) => `2026-09-27T10:${String(minute).padStart(2, "0")}:00.000Z`;

function message(id: string, senderId: string, minute: number): MessageDto {
  return { id, senderId, createdAt: at(minute) } as MessageDto;
}

describe("lastUnreadIncomingId", () => {
  it("désigne le DERNIER entrant non lu, pas le premier", () => {
    const thread = [message("m1", "coach", 1), message("m2", "coach", 2)];
    expect(lastUnreadIncomingId(thread, "me", null)).toBe("m2");
  });

  // Le cas de #305 : m1 marqué entre-temps, m2 arrivé après. L'id change, l'écran le voit.
  it("change quand un second entrant arrive après un premier marquage", () => {
    const before = [message("m1", "coach", 1)];
    const after = [message("m1", "coach", 1), message("m2", "coach", 3)];
    expect(lastUnreadIncomingId(before, "me", null)).toBe("m1");
    expect(lastUnreadIncomingId(after, "me", at(2))).toBe("m2");
  });

  it("ignore ses propres messages, même postérieurs à sa lecture", () => {
    const thread = [message("m1", "coach", 1), message("m2", "me", 2)];
    expect(lastUnreadIncomingId(thread, "me", null)).toBe("m1");
  });

  // Lu « jusqu'à » sa marque, bornes comprises : le message de la minute exacte est lu.
  it("rend null quand tout l'entrant est antérieur ou égal à la marque", () => {
    const thread = [message("m1", "coach", 1), message("m2", "coach", 2), message("m3", "me", 5)];
    expect(lastUnreadIncomingId(thread, "me", at(2))).toBeNull();
  });

  it("rend null sur un fil vide", () => {
    expect(lastUnreadIncomingId([], "me", null)).toBeNull();
  });

  // Sans session, tout message paraîtrait entrant — y compris les siens.
  it("rend null tant qu'on ne sait pas qui lit", () => {
    expect(lastUnreadIncomingId([message("m1", "coach", 1)], null, null)).toBeNull();
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

describe("readMarkOf", () => {
  // La liste suit mes lectures ; le fil résolu garde la marque de son ouverture.
  it("prend la marque de la liste plutôt que celle du fil résolu", () => {
    expect(readMarkOf({ lastReadAt: at(5) }, { lastReadAt: at(1) })).toBe(at(5));
  });

  // Même `null` dans la liste : « rien lu » est une marque, pas une absence.
  it("garde un « rien lu » de la liste", () => {
    expect(readMarkOf({ lastReadAt: null }, { lastReadAt: at(1) })).toBeNull();
  });

  it("retombe sur le fil résolu tant que la liste ne le porte pas", () => {
    expect(readMarkOf(undefined, { lastReadAt: at(1) })).toBe(at(1));
    expect(readMarkOf(null, { lastReadAt: at(1) })).toBe(at(1));
  });

  it("ne rend rien tant que rien n'est chargé", () => {
    expect(readMarkOf(undefined, undefined)).toBeNull();
  });
});
