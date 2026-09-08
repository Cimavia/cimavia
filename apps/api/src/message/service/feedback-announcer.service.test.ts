import { MessageType } from "@cmv/shared";
import type { Conversation, Prisma, SessionFeedback } from "@prisma/client";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { ConversationService } from "./conversation.service";
import { FeedbackAnnouncerService } from "./feedback-announcer.service";

const FEEDBACK = { id: "f1", coachId: "c1", athleteId: "a1" } as SessionFeedback;
const CONVERSATION = { id: "conv1", coachId: "c1", athleteId: "a1" } as Conversation;

/**
 * Un faux client tenant qui ne rend QUE les avis qu'on lui donne. C'est le seul moyen d'attaquer la
 * règle pour elle-même : ce que l'annonceur décide dépend entièrement de ce qu'il lit dans le fil.
 */
function build(existing: readonly { readAt: Date | null }[], options?: { ensureFails?: boolean }) {
  const findMany = vi.fn().mockResolvedValue([...existing]);
  const create = vi.fn().mockResolvedValue({ id: "m1", createdAt: new Date("2026-09-07") });
  const update = vi.fn().mockResolvedValue(undefined);
  const db = {
    message: { findMany },
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({ message: { create }, conversation: { update } }),
  } as unknown as TenantPrisma;

  const ensure = options?.ensureFails
    ? vi.fn().mockRejectedValue(new Error("fil injoignable"))
    : vi.fn().mockResolvedValue(CONVERSATION);
  const error = vi.fn();

  const service = new FeedbackAnnouncerService(
    db,
    { ensure } as unknown as ConversationService,
    { error } as unknown as PinoLogger,
  );
  return { service, findMany, create, update, ensure, error };
}

/** Les champs du message posé, tels que Prisma les recevrait. */
function posted(create: ReturnType<typeof vi.fn>): Prisma.MessageUncheckedCreateInput {
  const [args] = create.mock.calls;
  return (args?.[0] as { data: Prisma.MessageUncheckedCreateInput }).data;
}

describe("FeedbackAnnouncerService", () => {
  it("annonce un DÉPÔT quand le débrief n'a encore rien annoncé", async () => {
    const { service, create } = build([]);

    await service.announce(FEEDBACK);

    expect(posted(create)).toEqual({
      coachId: "c1",
      athleteId: "a1",
      conversationId: "conv1",
      // L'auteur est l'ATHLÈTE : c'est son geste qu'on annonce, et c'est ce qui aligne la bulle.
      senderId: "a1",
      type: MessageType.FEEDBACK_CREATED,
      sessionFeedbackId: "f1",
    });
  });

  /**
   * LA raison d'être de ce service. `attach` est appelé une fois par média : sans cette règle, un
   * athlète qui joint vingt photos d'un seul geste poserait vingt bulles dans le fil de son coach.
   */
  it("se tait tant que l'avis déjà posé n'a pas été lu", async () => {
    const { service, create, ensure } = build([{ readAt: null }]);

    await service.announce(FEEDBACK);

    expect(create).not.toHaveBeenCalled();
    // Pas même de fil ouvert : on renonce AVANT d'écrire quoi que ce soit.
    expect(ensure).not.toHaveBeenCalled();
  });

  it("se tait aussi quand un seul des avis posés reste non lu", async () => {
    const { service, create } = build([{ readAt: new Date("2026-09-01") }, { readAt: null }]);

    await service.announce(FEEDBACK);

    expect(create).not.toHaveBeenCalled();
  });

  /**
   * Une fois le coach passé, un complément est une information neuve — et le libellé change : on ne
   * lui redit pas « déposé » pour un débrief qu'il a déjà ouvert.
   */
  it("annonce une MISE À JOUR quand tout ce qui précède a été lu", async () => {
    const { service, create } = build([{ readAt: new Date("2026-09-01") }]);

    await service.announce(FEEDBACK);

    expect(posted(create).type).toBe(MessageType.FEEDBACK_UPDATED);
  });

  // Un avis remonte le fil comme un message : sinon un débrief déposé resterait en bas de la liste.
  it("remonte le fil dans la liste du coach", async () => {
    const { service, update } = build([]);

    await service.announce(FEEDBACK);

    expect(update).toHaveBeenCalledWith({
      where: { id: "conv1" },
      data: { lastMessageAt: new Date("2026-09-07") },
    });
  });

  // Ni texte ni média : le type porte tout le sens, et le lien vit dans `sessionFeedbackId`.
  it("ne recopie rien du débrief — pas de contenu, pas de clé objet", async () => {
    const { service, create } = build([]);

    await service.announce(FEEDBACK);

    const data = posted(create);
    expect(data.content).toBeUndefined();
    expect(data.storagePath).toBeUndefined();
  });

  /**
   * L'athlète a écrit son retour : c'est ÇA la donnée. Un avis manqué se rattrape tout seul au
   * geste suivant — la règle portant sur l'état, un dépôt non annoncé retrouve zéro avis.
   */
  it("ne fait pas échouer le débrief quand le fil est injoignable, mais le journalise", async () => {
    const { service, error } = build([], { ensureFails: true });

    await expect(service.announce(FEEDBACK)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "feedback.announce.failed", sessionFeedbackId: "f1" }),
      expect.any(String),
    );
  });
});
