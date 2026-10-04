import { FEEDBACK_EVENT_MESSAGE_TYPES } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import type { UserDirectoryService } from "../../account/service/user-directory.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { CoachFeedbackService } from "./coach-feedback.service";

const FEEDBACK = {
  id: "f1",
  scheduledSessionId: "s1",
  coachId: "c1",
  athleteId: "a1",
  content: "Bonnes sensations",
  coachReadAt: null,
  createdAt: new Date("2026-09-01T08:00:00Z"),
  updatedAt: new Date("2026-09-01T08:00:00Z"),
  _count: { media: 0 },
};
const SESSION = {
  id: "s1",
  planId: "p1",
  title: "Séance",
  scheduledDate: new Date("2026-09-01T00:00:00Z"),
};

type Reply = { senderId: string; createdAt: Date };

/**
 * Un faux client tenant qui rend UN débrief et les messages qu'on lui donne : « répondu » se
 * décide entièrement sur ce que la lecture des messages remonte.
 */
function build(messages: readonly Reply[]) {
  const findMessages = vi
    .fn()
    .mockResolvedValue(
      messages.map((message) => ({ ...message, sessionFeedbackId: "f1", coachId: "c1" })),
    );
  const db = {
    sessionFeedback: { findMany: vi.fn().mockResolvedValue([FEEDBACK]) },
    scheduledSession: { findMany: vi.fn().mockResolvedValue([SESSION]) },
    message: { findMany: findMessages },
  } as unknown as TenantPrisma;
  const users = {
    namesByIds: vi.fn().mockResolvedValue(new Map([["a1", "Léa"]])),
  } as unknown as UserDirectoryService;
  return { service: new CoachFeedbackService(db, users), findMessages };
}

describe("CoachFeedbackService.list — « répondu »", () => {
  it("date la réponse au PREMIER message du coach, pas à ceux de l'athlète", async () => {
    const { service } = build([
      { senderId: "a1", createdAt: new Date("2026-09-01T09:00:00Z") },
      { senderId: "c1", createdAt: new Date("2026-09-01T10:00:00Z") },
      { senderId: "c1", createdAt: new Date("2026-09-01T11:00:00Z") },
    ]);

    const [summary] = await service.list();

    expect(summary?.repliedAt).toBe("2026-09-01T10:00:00.000Z");
  });

  // `null` = personne n'a répondu, pas une date de repli (règle dure n°5).
  it("reste à null quand seul l'athlète a écrit", async () => {
    const { service } = build([{ senderId: "a1", createdAt: new Date("2026-09-01T09:00:00Z") }]);

    const [summary] = await service.list();

    expect(summary?.repliedAt).toBeNull();
  });

  /**
   * Le bug de #316 : en auto-coaching, l'avis « débrief déposé » est signé de l'athlète — qui est
   * aussi le coach. Un événement du serveur n'est pas une réponse, quel que soit son auteur.
   */
  it("ne lit pas les avis de débrief comme des réponses", async () => {
    const { service, findMessages } = build([]);

    await service.list();

    expect(findMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionFeedbackId: { in: ["f1"] },
          type: { notIn: [...FEEDBACK_EVENT_MESSAGE_TYPES] },
        },
      }),
    );
  });
});
