import { FEEDBACK_EVENT_MESSAGE_TYPES } from "@cmv/shared";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { UserDirectoryService } from "../../account/service/user-directory.service";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { CoachFeedbackService } from "./coach-feedback.service";

const FEEDBACK = {
  id: "f1",
  scheduledSessionId: "s1",
  coachId: "c1",
  athleteId: "a1",
  content: "Bonnes sensations",
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
type Read = { sessionFeedbackId: string; readAt: Date };

/**
 * Un faux client tenant qui rend UN débrief, les lectures qu'on lui donne, et un faux client de
 * base qui rend les messages : « lu » et « répondu » se décident sur ce qu'ils remontent.
 */
function build(messages: readonly Reply[], reads: readonly Read[] = []) {
  const findMessages = vi
    .fn()
    .mockResolvedValue(messages.map((message) => ({ ...message, sessionFeedbackId: "f1" })));
  const createReads = vi.fn().mockResolvedValue({ count: 1 });
  const findFeedback = vi.fn().mockResolvedValue({ id: "f1" });
  const db = {
    sessionFeedback: {
      findMany: vi.fn().mockResolvedValue([FEEDBACK]),
      findFirst: findFeedback,
    },
    scheduledSession: { findMany: vi.fn().mockResolvedValue([SESSION]) },
    sessionFeedbackRead: {
      findMany: vi.fn().mockResolvedValue(reads),
      createMany: createReads,
    },
  } as unknown as TenantPrisma;
  const prisma = { message: { findMany: findMessages } } as unknown as PrismaService;
  const users = {
    namesByIds: vi.fn().mockResolvedValue(
      new Map([
        ["a1", "Léa"],
        ["c1", "C"],
        ["m1", "M"],
      ]),
    ),
  } as unknown as UserDirectoryService;
  return {
    service: new CoachFeedbackService(db, users, prisma),
    findMessages,
    createReads,
    findFeedback,
  };
}

describe("CoachFeedbackService.list — « répondu »", () => {
  it("date la réponse au PREMIER message d'un coach, pas à ceux de l'athlète", async () => {
    const { service } = build([
      { senderId: "a1", createdAt: new Date("2026-09-01T09:00:00Z") },
      { senderId: "c1", createdAt: new Date("2026-09-01T10:00:00Z") },
      { senderId: "c1", createdAt: new Date("2026-09-01T11:00:00Z") },
    ]);

    const [summary] = await service.list();

    expect(summary?.firstReply).toEqual({
      at: "2026-09-01T10:00:00.000Z",
      coachId: "c1",
      coachName: "C",
    });
  });

  // C et M suivent le cycle de TI (#610) : la réponse de M, dans son fil, compte aussi chez C.
  it("nomme l'autre coach quand c'est lui qui a répondu le premier", async () => {
    const { service } = build([
      { senderId: "m1", createdAt: new Date("2026-09-01T10:00:00Z") },
      { senderId: "c1", createdAt: new Date("2026-09-01T11:00:00Z") },
    ]);

    const [summary] = await service.list();

    expect(summary?.firstReply).toEqual({
      at: "2026-09-01T10:00:00.000Z",
      coachId: "m1",
      coachName: "M",
    });
  });

  // `null` = personne n'a répondu, pas une date de repli (règle dure n°5).
  it("reste à null quand seul l'athlète a écrit", async () => {
    const { service } = build([{ senderId: "a1", createdAt: new Date("2026-09-01T09:00:00Z") }]);

    const [summary] = await service.list();

    expect(summary?.firstReply).toBeNull();
  });

  /**
   * Le bug de #316 : en auto-coaching, l'avis « débrief déposé » est signé de l'athlète — qui est
   * aussi le coach. Un événement du serveur n'est pas une réponse, quel que soit son auteur. Et la
   * lecture ne vise que les débriefs de la liste scopée, sans rien en rendre que date et auteur.
   */
  it("ne lit que les réponses aux débriefs listés, avis écartés, sans leur contenu", async () => {
    const { service, findMessages } = build([]);

    await service.list();

    expect(findMessages).toHaveBeenCalledWith({
      where: {
        sessionFeedbackId: { in: ["f1"] },
        type: { notIn: [...FEEDBACK_EVENT_MESSAGE_TYPES] },
      },
      orderBy: { createdAt: "asc" },
      select: { sessionFeedbackId: true, senderId: true, createdAt: true },
    });
  });
});

describe("CoachFeedbackService.list — « lu »", () => {
  it("rend la lecture du coach courant", async () => {
    const readAt = new Date("2026-09-02T08:00:00Z");
    const { service } = build([], [{ sessionFeedbackId: "f1", readAt }]);

    const [summary] = await service.list();

    expect(summary?.coachReadAt).toBe("2026-09-02T08:00:00.000Z");
  });

  it("le laisse à relire sans lecture du coach courant", async () => {
    const { service } = build([]);

    const [summary] = await service.list();

    expect(summary?.coachReadAt).toBeNull();
  });
});

describe("CoachFeedbackService.markRead", () => {
  // Le doublon (double clic, deux onglets) ne redate rien : la première lecture reste.
  it("pose la lecture sans écraser une lecture existante", async () => {
    const { service, createReads } = build([]);

    await service.markRead("f1");

    expect(createReads).toHaveBeenCalledWith({
      data: [{ sessionFeedbackId: "f1" }],
      skipDuplicates: true,
    });
  });

  it("refuse un débrief que le coach ne lit pas, sans rien poser", async () => {
    const { service, createReads, findFeedback } = build([]);
    findFeedback.mockResolvedValue(null);

    await expect(service.markRead("f-autre")).rejects.toBeInstanceOf(NotFoundException);
    expect(createReads).not.toHaveBeenCalled();
  });
});
