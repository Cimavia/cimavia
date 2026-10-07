import { FEEDBACK_EVENT_MESSAGE_TYPES, MessageType, type SendMessageInput } from "@cmv/shared";
import type { Conversation } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { StorageService } from "../../infra/storage/storage.service";
import type { NotificationService } from "../../notification/notification.service";
import type { AthletePlanService } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { TenantContext } from "../../tenancy/tenant-context.type";
import type { ConversationService } from "./conversation.service";
import { MessageService } from "./message.service";
import type { MessageAttachmentResolver } from "./message-attachment.resolver";

const CONVERSATION = { id: "conv1", coachId: "c1", athleteId: "a1" } as Conversation;
const ATHLETE: TenantContext = {
  userId: "a1",
  capabilities: { isCoach: false, isAthlete: true, isCompany: false },
  exercised: "athlete",
};

const TEXT: SendMessageInput = { type: MessageType.TEXT, content: "Fini la séance" };
const PHOTO: SendMessageInput = {
  type: MessageType.IMAGE,
  storagePath: "conversation/conv1/0b6f3c2e-8d1a-4c5e-9f7b-2a4d6e8c0f13-voie.jpg",
  fileName: "voie.jpg",
  mimeType: "image/jpeg",
  size: 1024,
};

/**
 * Ce que l'e2e ne voit pas : le push. Il tourne sans appareil enregistré, et n'observe donc que la
 * trace. La règle est ici attaquée pour elle-même — ce que `send` demande au NotificationService,
 * selon ce que le fil contient déjà.
 */
function build(unreadFromMe: number) {
  const count = vi.fn().mockResolvedValue(unreadFromMe);
  const created = { id: "m1", conversationId: "conv1", createdAt: new Date("2026-10-02") };
  const db = {
    message: { count },
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        message: { create: vi.fn().mockResolvedValue(created) },
        conversation: { update: vi.fn() },
      }),
  } as unknown as TenantPrisma;
  const notifyMessageReceived = vi.fn().mockResolvedValue(undefined);

  const service = new MessageService(
    db,
    { createDownloadUrl: vi.fn().mockResolvedValue("https://signed") } as unknown as StorageService,
    { getOwnedOrThrow: vi.fn().mockResolvedValue(CONVERSATION) } as unknown as ConversationService,
    { notifyMessageReceived } as unknown as NotificationService,
    {} as AthletePlanService,
    { resolve: vi.fn().mockResolvedValue(new Map()) } as unknown as MessageAttachmentResolver,
    { get: () => ATHLETE } as unknown as ClsService,
  );
  return { service, count, notifyMessageReceived };
}

describe("MessageService.send — canaux de notification", () => {
  it("ouvre une série : push et trace", async () => {
    const { service, notifyMessageReceived } = build(0);

    await service.send("conv1", TEXT);

    expect(notifyMessageReceived).toHaveBeenCalledExactlyOnceWith(
      { recipientId: "c1", senderId: "a1", conversationId: "conv1" },
      { push: true, trace: true },
    );
  });

  // #537 : un push par message, comme dans une messagerie. La trace, elle, attend la lecture.
  it("pousse le message suivant sans laisser de seconde trace", async () => {
    const { service, notifyMessageReceived } = build(1);

    await service.send("conv1", TEXT);

    expect(notifyMessageReceived).toHaveBeenCalledWith(expect.anything(), {
      push: true,
      trace: false,
    });
  });

  /**
   * Le bug de #539 : l'avis posé au nom de l'athlète restait non lu chez un coach qui travaille
   * depuis la page Débriefs, et comptait comme un message — le fil entier devenait muet.
   */
  it("ne compte pas les avis de débrief dans la série", async () => {
    const { service, count } = build(0);

    await service.send("conv1", TEXT);

    expect(count).toHaveBeenCalledExactlyOnceWith({
      where: {
        conversationId: "conv1",
        senderId: "a1",
        readAt: null,
        type: { notIn: [...FEEDBACK_EVENT_MESSAGE_TYPES] },
      },
    });
  });

  // Six photos d'une même sélection : seule la première arrivée pousse.
  it("ne pousse pas la suite d'un lot de médias", async () => {
    const { service, notifyMessageReceived } = build(1);

    await service.send("conv1", { ...PHOTO, continuesBatch: true });

    expect(notifyMessageReceived).not.toHaveBeenCalled();
  });

  // Le coach a lu entre deux photos : la suite du lot rouvre une série, sans faire vibrer.
  it("laisse une trace sans pousser quand la suite d'un lot rouvre une série", async () => {
    const { service, notifyMessageReceived } = build(0);

    await service.send("conv1", { ...PHOTO, continuesBatch: true });

    expect(notifyMessageReceived).toHaveBeenCalledWith(expect.anything(), {
      push: false,
      trace: true,
    });
  });

  it("pousse le premier média d'un lot", async () => {
    const { service, notifyMessageReceived } = build(1);

    await service.send("conv1", { ...PHOTO, continuesBatch: false });

    expect(notifyMessageReceived).toHaveBeenCalledWith(expect.anything(), {
      push: true,
      trace: false,
    });
  });
});
