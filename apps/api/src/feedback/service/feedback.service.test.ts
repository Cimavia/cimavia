import { MediaType } from "@cmv/shared";
import type { SessionFeedback } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { StorageService } from "../../infra/storage/storage.service";
import type { FeedbackAnnouncerService } from "../../message/service/feedback-announcer.service";
import type { MessageAttachmentResolver } from "../../message/service/message-attachment.resolver";
import type { NotificationService } from "../../notification/notification.service";
import type { AthletePlanService } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { FeedbackService, type WritableFeedback } from "./feedback.service";
import { FeedbackMediaService } from "./feedback-media.service";

const FEEDBACK = {
  id: "f1",
  coachId: "c1",
  athleteId: "a1",
  scheduledSessionId: "ss1",
} as SessionFeedback;

const EVENT = {
  coachId: "c1",
  athleteId: "a1",
  scheduledSessionId: "ss1",
  sessionTitle: "Bloc force",
};

function writable(created: boolean): WritableFeedback {
  return { feedback: FEEDBACK, sessionTitle: "Bloc force", created };
}

/**
 * Ce que l'e2e ne voit pas : le push. Il tourne sans appareil enregistré et n'observe que la trace,
 * or le complément d'un débrief ne laisse justement AUCUNE trace (#537). La règle est attaquée ici
 * pour elle-même.
 */
function build() {
  const update = vi.fn().mockResolvedValue(undefined);
  const announce = vi.fn().mockResolvedValue(undefined);
  const notifyFeedbackReceived = vi.fn().mockResolvedValue(undefined);
  const notifyFeedbackCompleted = vi.fn().mockResolvedValue(undefined);
  const service = new FeedbackService(
    { sessionFeedback: { update } } as unknown as TenantPrisma,
    {} as StorageService,
    {} as AthletePlanService,
    { notifyFeedbackReceived, notifyFeedbackCompleted } as unknown as NotificationService,
    {} as MessageAttachmentResolver,
    { announce } as unknown as FeedbackAnnouncerService,
  );
  return { service, update, announce, notifyFeedbackReceived, notifyFeedbackCompleted };
}

describe("FeedbackService.markSent", () => {
  it("annonce un débrief né de ce geste comme un nouveau débrief, et lui seul", async () => {
    const { service, announce, notifyFeedbackReceived, notifyFeedbackCompleted } = build();

    await service.markSent(writable(true), false);

    expect(notifyFeedbackReceived).toHaveBeenCalledExactlyOnceWith(EVENT);
    // Le dépôt initial ne pousse qu'une fois : pas de « complété » par-dessus.
    expect(notifyFeedbackCompleted).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledExactlyOnceWith(FEEDBACK);
  });

  it("pousse un complément sur un débrief déjà déposé, et le rend à relire", async () => {
    const { service, update, notifyFeedbackReceived, notifyFeedbackCompleted } = build();

    await service.markSent(writable(false), false);

    expect(notifyFeedbackCompleted).toHaveBeenCalledExactlyOnceWith(EVENT);
    expect(notifyFeedbackReceived).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "f1" },
      data: { coachReadAt: null },
    });
  });

  // Six photos d'une même sélection : la première a poussé, les suivantes se taisent — mais le
  // débrief reste « à relire » et l'annonceur garde la main sur le fil.
  it("tait la suite d'un lot, sans renoncer au reste", async () => {
    const { service, update, announce, notifyFeedbackCompleted } = build();

    await service.markSent(writable(false), true);

    expect(notifyFeedbackCompleted).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledTimes(1);
  });
});

describe("FeedbackMediaService.attach", () => {
  it("transmet la suite d'un lot à l'envoi du débrief", async () => {
    const markSent = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({
      id: "m1",
      type: MediaType.IMAGE,
      storagePath: "k",
      fileName: "voie.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      durationSeconds: null,
      createdAt: new Date("2026-10-02"),
    });
    const service = new FeedbackMediaService(
      {
        feedbackMedia: { count: vi.fn().mockResolvedValue(0), create },
      } as unknown as TenantPrisma,
      {
        createDownloadUrl: vi.fn().mockResolvedValue("https://signed"),
      } as unknown as StorageService,
      {
        getOrCreateWritable: vi.fn().mockResolvedValue(writable(false)),
        markSent,
      } as unknown as FeedbackService,
      {
        getPublishedSessionOrThrow: vi.fn().mockResolvedValue({ athleteId: "a1" }),
      } as unknown as AthletePlanService,
    );

    await service.attach("ss1", {
      type: MediaType.IMAGE,
      storagePath: "athlete/a1/feedback/ss1/0b6f3c2e-8d1a-4c5e-9f7b-2a4d6e8c0f13-voie.jpg",
      fileName: "voie.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      continuesBatch: true,
    });

    expect(markSent).toHaveBeenCalledExactlyOnceWith(writable(false), true);
  });
});
