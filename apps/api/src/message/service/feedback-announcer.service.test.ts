import { MessageType } from "@cmv/shared";
import type { Prisma, SessionFeedback } from "@prisma/client";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { ConversationService, JoinedConversation } from "./conversation.service";
import { FeedbackAnnouncerService } from "./feedback-announcer.service";

const FEEDBACK = { id: "f1", coachId: "c1", athleteId: "a1" } as SessionFeedback;

// La marque de lecture du Coach dans son fil direct, et des avis posés avant ou après.
const READ_AT = new Date("2026-09-05T10:00:00Z");
const READ = { createdAt: new Date("2026-09-05T09:00:00Z") };
const UNREAD = { createdAt: new Date("2026-09-05T11:00:00Z") };

/** Le fil direct de chaque Coach avec l'athlète, tel que `findDirect` / `ensure` le rendraient. */
const threadOf = (coachId: string, coachReadAt: Date | null = READ_AT) =>
  ({
    id: `conv-${coachId}`,
    participants: [
      { userId: coachId, capability: "COACH", lastReadAt: coachReadAt },
      { userId: "a1", capability: "ATHLETE", lastReadAt: null },
    ],
  }) as JoinedConversation;

type Events = readonly { createdAt: Date }[];
type Thread = { events: Events; coachReadAt?: Date | null };

/**
 * Un faux client tenant qui ne rend QUE les avis qu'on lui donne, fil par fil. C'est le seul moyen
 * d'attaquer la règle pour elle-même : ce que l'annonceur décide dépend entièrement de ce qu'il lit
 * dans le fil. `existing` absent d'un Coach = pas encore de fil direct avec lui.
 */
function build(existing: Events | Record<string, Thread>, options?: { ensureFailsFor?: string }) {
  const threads: Record<string, Thread> = Array.isArray(existing)
    ? { c1: { events: existing }, m1: { events: existing } }
    : (existing as Record<string, Thread>);
  const findMany = vi.fn(async ({ where }: { where: { conversationId: string } }) => [
    ...(threads[where.conversationId.replace("conv-", "")]?.events ?? []),
  ]);
  const create = vi.fn().mockResolvedValue({ id: "m1", createdAt: new Date("2026-09-07") });
  const update = vi.fn().mockResolvedValue(undefined);
  const db = {
    message: { findMany },
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({ message: { create }, conversation: { update } }),
  } as unknown as TenantPrisma;

  // Sans avis, pas de fil : il faut l'ouvrir. Avec, il existe déjà.
  const findDirect = vi.fn(async (coachId: string) => {
    const thread = threads[coachId];
    return thread == null || thread.events.length === 0
      ? null
      : threadOf(coachId, thread.coachReadAt === undefined ? READ_AT : thread.coachReadAt);
  });
  const ensure = vi.fn(async (coachId: string) => {
    if (coachId === options?.ensureFailsFor) throw new Error("fil injoignable");
    return threadOf(coachId);
  });
  const error = vi.fn();

  const service = new FeedbackAnnouncerService(
    db,
    { findDirect, ensure } as unknown as ConversationService,
    { error } as unknown as PinoLogger,
  );
  return { service, findMany, create, update, ensure, findDirect, error };
}

/** Les champs des messages posés, tels que Prisma les recevrait. */
function allPosted(create: ReturnType<typeof vi.fn>): Prisma.MessageUncheckedCreateInput[] {
  return create.mock.calls.map(
    (args) => (args[0] as { data: Prisma.MessageUncheckedCreateInput }).data,
  );
}

function posted(create: ReturnType<typeof vi.fn>): Prisma.MessageUncheckedCreateInput {
  const [first] = allPosted(create);
  return first as Prisma.MessageUncheckedCreateInput;
}

describe("FeedbackAnnouncerService", () => {
  it("annonce un DÉPÔT quand le débrief n'a encore rien annoncé", async () => {
    const { service, create } = build([]);

    await service.announce(FEEDBACK, ["c1"]);

    expect(posted(create)).toEqual({
      conversationId: "conv-c1",
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
    const { service, create, ensure } = build([UNREAD]);

    await service.announce(FEEDBACK, ["c1"]);

    expect(create).not.toHaveBeenCalled();
    // Pas même de fil ouvert : on renonce AVANT d'écrire quoi que ce soit.
    expect(ensure).not.toHaveBeenCalled();
  });

  // Personne à prévenir — l'auto-coaching (#316), où l'athlète est son propre Coach : aucun fil.
  it("n'ouvre aucun fil sans destinataire", async () => {
    const { service, findMany, create, ensure, findDirect } = build([]);

    await service.announce(FEEDBACK, []);

    expect(findDirect).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  // C et M suivent le cycle de TI (#610) : un avis chacun, dans son fil direct avec l'athlète.
  it("pose un avis dans le fil de chaque Coach destinataire", async () => {
    const { service, create, ensure } = build([]);

    await service.announce(FEEDBACK, ["c1", "m1"]);

    expect(ensure.mock.calls).toEqual([
      ["c1", "a1"],
      ["m1", "a1"],
    ]);
    expect(allPosted(create).map((data) => data.conversationId)).toEqual(["conv-c1", "conv-m1"]);
  });

  // L'état se lit fil par fil : l'avis que M n'a pas lu ne fait pas taire celui de C.
  it("décide pour chaque fil sur ses seuls avis", async () => {
    const { service, create, findMany } = build({
      c1: { events: [READ] },
      m1: { events: [UNREAD] },
    });

    await service.announce(FEEDBACK, ["c1", "m1"]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: "conv-m1",
          sessionFeedbackId: "f1",
          type: { in: [MessageType.FEEDBACK_CREATED, MessageType.FEEDBACK_UPDATED] },
        },
      }),
    );
    expect(allPosted(create).map((data) => [data.conversationId, data.type])).toEqual([
      ["conv-c1", MessageType.FEEDBACK_UPDATED],
    ]);
  });

  it("prévient les autres quand le fil de l'un est injoignable", async () => {
    const { service, create, error } = build([], { ensureFailsFor: "c1" });

    await service.announce(FEEDBACK, ["c1", "m1"]);

    expect(allPosted(create).map((data) => data.conversationId)).toEqual(["conv-m1"]);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "feedback.announce.failed", coachId: "c1" }),
      expect.any(String),
    );
  });

  it("se tait aussi quand un seul des avis posés reste non lu", async () => {
    const { service, create } = build([READ, UNREAD]);

    await service.announce(FEEDBACK, ["c1"]);

    expect(create).not.toHaveBeenCalled();
  });

  /**
   * Une fois le coach passé, un complément est une information neuve — et le libellé change : on ne
   * lui redit pas « déposé » pour un débrief qu'il a déjà ouvert.
   */
  it("annonce une MISE À JOUR quand tout ce qui précède a été lu", async () => {
    const { service, create, ensure } = build([READ]);

    await service.announce(FEEDBACK, ["c1"]);

    expect(posted(create).type).toBe(MessageType.FEEDBACK_UPDATED);
    // Le fil existe : on y écrit sans le rouvrir.
    expect(ensure).not.toHaveBeenCalled();
  });

  // Un Coach qui n'a encore rien lu du fil n'a pas lu l'avis non plus.
  it("se tait quand le Coach n'a encore rien lu du fil", async () => {
    const { service, create } = build({ c1: { events: [READ], coachReadAt: null } });

    await service.announce(FEEDBACK, ["c1"]);

    expect(create).not.toHaveBeenCalled();
  });

  // Un avis remonte le fil comme un message : sinon un débrief déposé resterait en bas de la liste.
  it("remonte le fil dans la liste du coach", async () => {
    const { service, update } = build([]);

    await service.announce(FEEDBACK, ["c1"]);

    expect(update).toHaveBeenCalledWith({
      where: { id: "conv-c1" },
      data: { lastMessageAt: new Date("2026-09-07") },
    });
  });

  // Ni texte ni média : le type porte tout le sens, et le lien vit dans `sessionFeedbackId`.
  it("ne recopie rien du débrief — pas de contenu, pas de clé objet", async () => {
    const { service, create } = build([]);

    await service.announce(FEEDBACK, ["c1"]);

    const data = posted(create);
    expect(data.content).toBeUndefined();
    expect(data.storagePath).toBeUndefined();
  });

  /**
   * L'athlète a écrit son retour : c'est ÇA la donnée. Un avis manqué se rattrape tout seul au
   * geste suivant — la règle portant sur l'état, un dépôt non annoncé retrouve zéro avis.
   */
  it("ne fait pas échouer le débrief quand le fil est injoignable, mais le journalise", async () => {
    const { service, error } = build([], { ensureFailsFor: "c1" });

    await expect(service.announce(FEEDBACK, ["c1"])).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "feedback.announce.failed", sessionFeedbackId: "f1" }),
      expect.any(String),
    );
  });
});
