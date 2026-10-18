import { FEEDBACK_EVENT_MESSAGE_TYPES, MessageType, type SendMessageInput } from "@cmv/shared";
import type { ConversationParticipant } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { StorageService } from "../../infra/storage/storage.service";
import type { NotificationService } from "../../notification/notification.service";
import type { AthletePlanService } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { TenantContext } from "../../tenancy/tenant-context.type";
import type { ConversationService, JoinedConversation } from "./conversation.service";
import { MessageService } from "./message.service";
import type { MessageAttachmentResolver } from "./message-attachment.resolver";

// Ce que les AUTRES Coachs du fil lisent : la règle de lecture elle-même est testée avec le
// registre (`coach-reads`) ; ici, seul compte ce que le service en fait.
const { coachesWhoRead } = vi.hoisted(() => ({ coachesWhoRead: vi.fn() }));
vi.mock("../../tenancy/coach-reads", () => ({ coachesWhoRead }));

const participant = (
  userId: string,
  capability: "COACH" | "ATHLETE",
  lastReadAt: Date | null = null,
): ConversationParticipant => ({
  id: `p-${userId}`,
  conversationId: "conv1",
  userId,
  capability,
  lastReadAt,
  createdAt: new Date("2026-10-01"),
});

const joined = (...participants: ConversationParticipant[]) =>
  ({
    id: "conv1",
    kind: participants.length === 2 ? "DIRECT" : "GROUP",
    participants,
  }) as JoinedConversation;

const actorOf = (userId: string, exercised: "coach" | "athlete"): TenantContext => ({
  userId,
  capabilities: {
    isCoach: exercised === "coach",
    isAthlete: exercised === "athlete",
    isCompany: false,
  },
  exercised,
});
const ATHLETE = actorOf("a1", "athlete");
const COACH = actorOf("c1", "coach");

const TEXT: SendMessageInput = { type: MessageType.TEXT, content: "Fini la séance" };
const PHOTO: SendMessageInput = {
  type: MessageType.IMAGE,
  storagePath: "conversation/conv1/0b6f3c2e-8d1a-4c5e-9f7b-2a4d6e8c0f13-voie.jpg",
  fileName: "voie.jpg",
  mimeType: "image/jpeg",
  size: 1024,
};

// Mon dernier message du fil, avant celui qu'on envoie.
const MY_LAST = new Date("2026-10-02T10:00:00Z");
const BEFORE = new Date("2026-10-02T09:00:00Z");
const AFTER = new Date("2026-10-02T11:00:00Z");

type Setup = {
  conversation?: JoinedConversation;
  actor?: TenantContext;
  latestFromMe?: Date | null;
  session?: { id: string; athleteId: string | null } | null;
  feedback?: { id: string; athleteId: string } | null;
};

/**
 * Ce que l'e2e ne voit pas : le push. Il tourne sans appareil enregistré, et n'observe donc que la
 * trace. La règle est ici attaquée pour elle-même — ce que `send` demande au NotificationService,
 * selon ce que chaque destinataire a déjà lu.
 */
function build(setup: Setup = {}) {
  const conversation =
    setup.conversation ?? joined(participant("a1", "ATHLETE"), participant("c1", "COACH", AFTER));
  const latestFromMe = setup.latestFromMe === undefined ? MY_LAST : setup.latestFromMe;
  const findFirst = vi
    .fn()
    .mockResolvedValue(latestFromMe == null ? null : { createdAt: latestFromMe });
  const create = vi.fn().mockResolvedValue({
    id: "m1",
    conversationId: "conv1",
    createdAt: new Date("2026-10-02T12:00:00Z"),
  });
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const db = {
    message: { findFirst },
    conversationParticipant: { updateMany },
    scheduledSession: { findFirst: vi.fn().mockResolvedValue(setup.session ?? null) },
    sessionFeedback: { findFirst: vi.fn().mockResolvedValue(setup.feedback ?? null) },
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({ message: { create }, conversation: { update: vi.fn() } }),
  } as unknown as TenantPrisma;
  const notifyMessageReceived = vi.fn().mockResolvedValue(undefined);
  const getJoinedOrThrow = vi.fn().mockResolvedValue(conversation);

  const service = new MessageService(
    db,
    { createDownloadUrl: vi.fn().mockResolvedValue("https://signed") } as unknown as StorageService,
    { getJoinedOrThrow } as unknown as ConversationService,
    { notifyMessageReceived } as unknown as NotificationService,
    {
      getPublishedSessionOrThrow: vi.fn().mockResolvedValue(setup.session ?? null),
    } as unknown as AthletePlanService,
    { resolve: vi.fn().mockResolvedValue(new Map()) } as unknown as MessageAttachmentResolver,
    { get: () => setup.actor ?? ATHLETE } as unknown as ClsService,
    {} as PrismaService,
  );
  return { service, findFirst, create, updateMany, notifyMessageReceived, getJoinedOrThrow };
}

beforeEach(() => {
  coachesWhoRead.mockReset();
});

describe("MessageService.send — canaux de notification", () => {
  it("ouvre une série chez qui a lu mon dernier message : push et trace", async () => {
    const { service, notifyMessageReceived } = build();

    await service.send("conv1", TEXT);

    expect(notifyMessageReceived).toHaveBeenCalledExactlyOnceWith(
      { recipientId: "c1", senderId: "a1", conversationId: "conv1" },
      { push: true, trace: true },
    );
  });

  it("ouvre une série au tout premier message du fil", async () => {
    const { service, notifyMessageReceived } = build({
      conversation: joined(participant("a1", "ATHLETE"), participant("c1", "COACH")),
      latestFromMe: null,
    });

    await service.send("conv1", TEXT);

    expect(notifyMessageReceived).toHaveBeenCalledWith(expect.anything(), {
      push: true,
      trace: true,
    });
  });

  // #537 : un push par message, comme dans une messagerie. La trace, elle, attend la lecture.
  it("pousse le message suivant sans laisser de seconde trace", async () => {
    const { service, notifyMessageReceived } = build({
      conversation: joined(participant("a1", "ATHLETE"), participant("c1", "COACH", BEFORE)),
    });

    await service.send("conv1", TEXT);

    expect(notifyMessageReceived).toHaveBeenCalledWith(expect.anything(), {
      push: true,
      trace: false,
    });
  });

  it("ne laisse pas de trace à qui n'a encore rien lu", async () => {
    const { service, notifyMessageReceived } = build({
      conversation: joined(participant("a1", "ATHLETE"), participant("c1", "COACH")),
    });

    await service.send("conv1", TEXT);

    expect(notifyMessageReceived).toHaveBeenCalledWith(expect.anything(), {
      push: true,
      trace: false,
    });
  });

  // #611 : à plusieurs, chacun lit à son heure — la série se lit destinataire par destinataire.
  it("notifie chaque autre participant, selon ce que LUI a lu", async () => {
    const { service, notifyMessageReceived } = build({
      actor: COACH,
      conversation: joined(
        participant("c1", "COACH"),
        participant("m1", "COACH", AFTER),
        participant("a1", "ATHLETE", BEFORE),
      ),
    });

    await service.send("conv1", TEXT);

    expect(notifyMessageReceived.mock.calls).toEqual([
      [
        { recipientId: "m1", senderId: "c1", conversationId: "conv1" },
        { push: true, trace: true },
      ],
      [
        { recipientId: "a1", senderId: "c1", conversationId: "conv1" },
        { push: true, trace: false },
      ],
    ]);
  });

  /**
   * Le bug de #539 : l'avis posé au nom de l'athlète restait non lu chez un coach qui travaille
   * depuis la page Débriefs, et comptait comme un message — le fil entier devenait muet.
   */
  it("ne compte pas les avis de débrief dans la série", async () => {
    const { service, findFirst } = build();

    await service.send("conv1", TEXT);

    expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where: {
        conversationId: "conv1",
        senderId: "a1",
        type: { notIn: [...FEEDBACK_EVENT_MESSAGE_TYPES] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
  });

  // Six photos d'une même sélection : seule la première arrivée pousse.
  it("ne pousse pas la suite d'un lot de médias", async () => {
    const { service, notifyMessageReceived } = build({
      conversation: joined(participant("a1", "ATHLETE"), participant("c1", "COACH", BEFORE)),
    });

    await service.send("conv1", { ...PHOTO, continuesBatch: true });

    expect(notifyMessageReceived).not.toHaveBeenCalled();
  });

  // Le coach a lu entre deux photos : la suite du lot rouvre une série, sans faire vibrer.
  it("laisse une trace sans pousser quand la suite d'un lot rouvre une série", async () => {
    const { service, notifyMessageReceived } = build();

    await service.send("conv1", { ...PHOTO, continuesBatch: true });

    expect(notifyMessageReceived).toHaveBeenCalledWith(expect.anything(), {
      push: false,
      trace: true,
    });
  });

  it("pousse le premier média d'un lot", async () => {
    const { service, notifyMessageReceived } = build({
      conversation: joined(participant("a1", "ATHLETE"), participant("c1", "COACH", BEFORE)),
    });

    await service.send("conv1", { ...PHOTO, continuesBatch: false });

    expect(notifyMessageReceived).toHaveBeenCalledWith(expect.anything(), {
      push: true,
      trace: false,
    });
  });

  // L'extension injecte l'auteur ; le fil n'est que vérifié — plus de colonnes tenant recopiées.
  it("écrit le message dans le fil, au nom de l'acteur", async () => {
    const { service, create } = build();

    await service.send("conv1", TEXT);

    expect(create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv1",
        senderId: "a1",
        scheduledSessionId: null,
        sessionFeedbackId: null,
        type: MessageType.TEXT,
        content: "Fini la séance",
      },
    });
  });
});

describe("MessageService.markRead", () => {
  it("pose la marque sur le dernier message visible, jamais à reculons", async () => {
    const { service, updateMany, findFirst, getJoinedOrThrow } = build();

    await service.markRead("conv1");

    expect(getJoinedOrThrow).toHaveBeenCalledWith("conv1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { conversationId: "conv1" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        conversationId: "conv1",
        OR: [{ lastReadAt: null }, { lastReadAt: { lt: MY_LAST } }],
      },
      data: { lastReadAt: MY_LAST },
    });
  });

  it("ne touche à rien dans un fil encore vide", async () => {
    const { service, updateMany } = build({ latestFromMe: null });

    await service.markRead("conv1");

    expect(updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Le rattachement tient au fil quand TOUS ses participants lisent la cible (#611) : l'athlète ses
 * propres séances, chaque Coach ce que son filtre lui ouvre.
 */
describe("MessageService.send — rattachement lu par tous", () => {
  const GROUP = joined(
    participant("c1", "COACH"),
    participant("m1", "COACH"),
    participant("a1", "ATHLETE"),
  );

  it("admet une séance de l'athlète du fil, lue par chaque autre Coach", async () => {
    coachesWhoRead.mockResolvedValue(["m1"]);
    const { service, create } = build({
      actor: COACH,
      conversation: GROUP,
      session: { id: "s1", athleteId: "a1" },
    });

    await service.send("conv1", { ...TEXT, scheduledSessionId: "s1" });

    expect(coachesWhoRead).toHaveBeenCalledWith(expect.anything(), "ScheduledSession", "s1", [
      "m1",
    ]);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scheduledSessionId: "s1" }),
    });
  });

  it("refuse une séance qu'un autre Coach du fil ne lit pas", async () => {
    coachesWhoRead.mockResolvedValue([]);
    const { service, create } = build({
      actor: COACH,
      conversation: GROUP,
      session: { id: "s1", athleteId: "a1" },
    });

    await expect(
      service.send("conv1", { ...TEXT, scheduledSessionId: "s1" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse la séance d'un autre athlète que celui du fil, sans rien relire", async () => {
    const { service } = build({
      actor: COACH,
      conversation: GROUP,
      session: { id: "s2", athleteId: "a2" },
    });

    await expect(
      service.send("conv1", { ...TEXT, scheduledSessionId: "s2" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(coachesWhoRead).not.toHaveBeenCalled();
  });

  // Entre Coachs, on parle d'un débrief sans lui répondre : il ne se cite pas (#610).
  it("refuse un débrief dans un fil sans son athlète", async () => {
    coachesWhoRead.mockResolvedValue(["m1"]);
    const { service, create } = build({
      actor: COACH,
      conversation: joined(participant("c1", "COACH"), participant("m1", "COACH")),
      feedback: { id: "f1", athleteId: "a1" },
    });

    await expect(service.send("conv1", { ...TEXT, sessionFeedbackId: "f1" })).rejects.toMatchObject(
      { status: 400 },
    );
    expect(create).not.toHaveBeenCalled();
  });

  // Deux athlètes réunis : aucun ne lit les séances de l'autre, aucune ne se cite.
  it("refuse tout débrief quand deux athlètes sont réunis", async () => {
    const { service } = build({
      actor: COACH,
      conversation: joined(
        participant("c1", "COACH"),
        participant("a1", "ATHLETE"),
        participant("a2", "ATHLETE"),
      ),
      feedback: { id: "f1", athleteId: "a1" },
    });

    await expect(service.send("conv1", { ...TEXT, sessionFeedbackId: "f1" })).rejects.toMatchObject(
      { status: 400 },
    );
  });

  // C et M parlent de TE entre Coachs : la séance se cite si M la lit aussi.
  it("admet entre Coachs la séance d'un athlète absent du fil", async () => {
    coachesWhoRead.mockResolvedValue(["m1"]);
    const { service, create } = build({
      actor: COACH,
      conversation: joined(participant("c1", "COACH"), participant("m1", "COACH")),
      session: { id: "s1", athleteId: "a1" },
    });

    await service.send("conv1", { ...TEXT, scheduledSessionId: "s1" });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scheduledSessionId: "s1" }),
    });
  });

  // L'athlète écrit à son Coach : sa lecture à lui est prouvée, celle du Coach se relit.
  it("relit côté athlète la lecture du Coach du fil", async () => {
    coachesWhoRead.mockResolvedValue(["c1"]);
    const { service } = build({ feedback: { id: "f1", athleteId: "a1" } });

    await service.send("conv1", { ...TEXT, sessionFeedbackId: "f1" });

    expect(coachesWhoRead).toHaveBeenCalledWith(expect.anything(), "SessionFeedback", "f1", ["c1"]);
  });

  it("n'a rien à relire quand le seul autre participant est l'athlète", async () => {
    const { service, create } = build({
      actor: COACH,
      conversation: joined(participant("c1", "COACH"), participant("a1", "ATHLETE")),
      feedback: { id: "f1", athleteId: "a1" },
    });

    await service.send("conv1", { ...TEXT, sessionFeedbackId: "f1" });

    expect(coachesWhoRead).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionFeedbackId: "f1" }),
    });
  });
});
