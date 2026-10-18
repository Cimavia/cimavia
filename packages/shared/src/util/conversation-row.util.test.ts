import { describe, expect, it } from "vitest";
import type { ConversationDto } from "../dto/message.schema";
import { directCounterpartId } from "./conversation-row.util";

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
