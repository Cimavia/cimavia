import { describe, expect, it } from "vitest";
import type { ConversationDto } from "../dto/message.schema";
import {
  type ConversationRelation,
  conversationRows,
  counterpartOfConversation,
} from "./conversation-row.util";

const relation = (coachId: string, athleteId: string, isSelf = false): ConversationRelation => ({
  coachId,
  coachName: `Coach ${coachId}`,
  athleteId,
  athleteName: `Athlète ${athleteId}`,
  isSelf,
});

const thread = (
  id: string,
  counterpartId: string,
  lastMessageAt: string | null,
): ConversationDto => ({
  id,
  counterpartId,
  counterpartName: counterpartId,
  lastMessageAt,
  lastMessageType: null,
  lastMessagePreview: null,
  unreadCount: 0,
});

describe("conversationRows", () => {
  it("nomme l'athlète pour le coach, et le coach pour l'athlète", () => {
    const relations = [relation("c1", "a1")];

    expect(conversationRows(relations, [], "coach")).toEqual([
      { counterpartId: "a1", counterpartName: "Athlète a1", conversation: null },
    ]);
    expect(conversationRows(relations, [], "athlete")).toEqual([
      { counterpartId: "c1", counterpartName: "Coach c1", conversation: null },
    ]);
  });

  // Un athlète suivi par deux coachs a deux lignes — c'est tout l'objet de #599.
  it("rend une ligne par coach, fil ou pas, les plus récemment actifs d'abord", () => {
    const relations = [relation("c1", "a1"), relation("c2", "a1"), relation("c3", "a1")];
    const threads = [
      thread("t1", "c1", "2026-10-01T08:00:00.000Z"),
      thread("t3", "c3", "2026-10-05T08:00:00.000Z"),
    ];

    const rows = conversationRows(relations, threads, "athlete");

    expect(rows.map((row) => row.counterpartId)).toEqual(["c3", "c1", "c2"]);
    expect(rows[0]?.conversation?.id).toBe("t3");
    expect(rows[2]?.conversation).toBeNull();
  });

  // Le fil (soi, soi) ne peut pas exister : la ligne menait à un écran d'erreur (#198).
  it("écarte l'entrée synthétique de l'auto-coaching", () => {
    const relations = [relation("me", "me", true), relation("me", "a1")];

    expect(conversationRows(relations, [], "coach").map((row) => row.counterpartId)).toEqual([
      "a1",
    ]);
  });
});

describe("counterpartOfConversation", () => {
  const rows = conversationRows(
    [relation("c1", "a1"), relation("c2", "a1")],
    [thread("t2", "c2", "2026-10-05T08:00:00.000Z")],
    "athlete",
  );

  it("traduit le fil d'une notification en interlocuteur", () => {
    expect(counterpartOfConversation(rows, "t2")).toBe("c2");
  });

  it("ne devine rien sans fil demandé, ou pour un fil absent de la liste", () => {
    expect(counterpartOfConversation(rows, undefined)).toBeNull();
    expect(counterpartOfConversation(rows, "inconnu")).toBeNull();
  });
});
