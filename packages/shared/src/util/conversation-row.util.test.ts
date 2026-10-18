import { describe, expect, it } from "vitest";
import type { ConversationDto } from "../dto/message.schema";
import {
  type ConversationRelation,
  conversationRows,
  counterpartOfConversation,
  directCounterpartId,
} from "./conversation-row.util";

const relation = (coachId: string, athleteId: string, isSelf = false): ConversationRelation => ({
  coachId,
  coachName: `Coach ${coachId}`,
  athleteId,
  athleteName: `Athlète ${athleteId}`,
  isSelf,
});

const participant = (userId: string, capability: "coach" | "athlete") => ({
  userId,
  name: userId,
  capability,
  lastReadAt: null,
});

const conversation = (
  id: string,
  participants: ConversationDto["participants"],
  lastMessageAt: string | null,
  createdAt = "2026-09-01T08:00:00.000Z",
): ConversationDto => ({
  id,
  kind: participants.length === 1 ? "DIRECT" : "GROUP",
  participants,
  lastReadAt: null,
  lastMessageAt,
  lastMessageSenderId: null,
  lastMessageType: null,
  lastMessagePreview: null,
  unreadCount: 0,
  createdAt,
});

// Le fil à deux vu de l'athlète : son interlocuteur est un coach.
const thread = (id: string, coachId: string, lastMessageAt: string | null) =>
  conversation(id, [participant(coachId, "coach")], lastMessageAt);

describe("directCounterpartId", () => {
  it("rend l'interlocuteur d'un fil à deux, s'il participe à ce titre", () => {
    const direct = thread("t1", "c1", null);

    expect(directCounterpartId(direct, "coach")).toBe("c1");
    // C ↔ M est un fil entre Coachs : il n'est celui d'aucun athlète.
    expect(directCounterpartId(direct, "athlete")).toBeNull();
  });

  it("ne rend personne pour une conversation à plusieurs", () => {
    const group = conversation(
      "g1",
      [participant("c1", "coach"), participant("c2", "coach")],
      null,
    );

    expect(directCounterpartId(group, "coach")).toBeNull();
  });
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

  // Une conversation vide a été créée : elle passe devant un fil plus ancien (#611).
  it("range un fil encore vide à sa création", () => {
    const relations = [relation("c1", "a1"), relation("c2", "a1")];
    const threads = [
      thread("t1", "c1", "2026-10-01T08:00:00.000Z"),
      conversation("t2", [participant("c2", "coach")], null, "2026-10-03T08:00:00.000Z"),
    ];

    const rows = conversationRows(relations, threads, "athlete");

    expect(rows.map((row) => row.counterpartId)).toEqual(["c2", "c1"]);
  });

  // Les écrans à plusieurs arrivent avec #612 : d'ici là, un groupe n'emprunte pas une ligne.
  it("ne rattache à une relation ni un groupe, ni un fil entre Coachs", () => {
    const relations = [relation("c1", "a1")];
    const threads = [
      conversation("g1", [participant("a1", "athlete"), participant("c2", "coach")], null),
      conversation("t1", [participant("a1", "coach")], null),
    ];

    expect(conversationRows(relations, threads, "coach")[0]?.conversation).toBeNull();
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
