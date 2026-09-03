import { MessageAttachmentType, MessageType } from "@cmv/shared";
import type { Message } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { MessageAttachmentResolver } from "./message-attachment.resolver";

const SESSION = { id: "s1", title: "Voie & projet 7b", scheduledDate: new Date("2026-10-16") };

/**
 * Un faux client tenant qui ne rend QUE ce qu'on lui donne. C'est la seule façon de vérifier la
 * propriété qui compte ici : quand la lecture scopée ne rend rien — une cible hors relation, ou
 * supprimée — le résolveur n'invente aucun libellé.
 */
function fakeDb(
  feedbacks: readonly { id: string; scheduledSessionId: string }[],
  sessions: readonly (typeof SESSION)[],
) {
  const findFeedbacks = vi.fn().mockResolvedValue([...feedbacks]);
  const findSessions = vi.fn().mockResolvedValue([...sessions]);
  const db = {
    sessionFeedback: { findMany: findFeedbacks },
    scheduledSession: { findMany: findSessions },
  } as unknown as TenantPrisma;
  return { db, findFeedbacks, findSessions };
}

/** Les ids demandés par le premier (et unique) `findMany` du lot. */
function requestedIds(findMany: ReturnType<typeof vi.fn>): string[] {
  const [args] = findMany.mock.calls;
  return (args?.[0] as { where: { id: { in: string[] } } }).where.id.in;
}

function message(overrides: Partial<Message> & { id: string }): Message {
  return {
    scheduledSessionId: null,
    sessionFeedbackId: null,
    type: MessageType.TEXT,
    ...overrides,
  } as Message;
}

describe("MessageAttachmentResolver", () => {
  it("ne touche pas la base quand aucun message n'est rattaché", async () => {
    const { db, findFeedbacks, findSessions } = fakeDb([], []);
    const resolved = await new MessageAttachmentResolver(db).resolve([message({ id: "m1" })]);

    expect(resolved.size).toBe(0);
    expect(findFeedbacks).not.toHaveBeenCalled();
    expect(findSessions).not.toHaveBeenCalled();
  });

  it("résout une séance citée, titre et date compris", async () => {
    const { db } = fakeDb([], [SESSION]);
    const resolved = await new MessageAttachmentResolver(db).resolve([
      message({ id: "m1", scheduledSessionId: "s1" }),
    ]);

    expect(resolved.get("m1")).toEqual({
      type: MessageAttachmentType.SCHEDULED_SESSION,
      id: "s1",
      scheduledSessionId: "s1",
      sessionTitle: "Voie & projet 7b",
      scheduledDate: "2026-10-16",
    });
  });

  // Un débrief n'a pas de titre : c'est la séance débriefée qui en porte un, et l'id de cette
  // séance est ce dont le client a besoin pour naviguer (la route mobile est `/feedbacks/[sessionId]`).
  it("résout un débrief par la séance qu'il débriefe", async () => {
    const { db } = fakeDb([{ id: "f1", scheduledSessionId: "s1" }], [SESSION]);
    const resolved = await new MessageAttachmentResolver(db).resolve([
      message({ id: "m1", sessionFeedbackId: "f1" }),
    ]);

    expect(resolved.get("m1")).toEqual({
      type: MessageAttachmentType.SESSION_FEEDBACK,
      id: "f1",
      scheduledSessionId: "s1",
      sessionTitle: "Voie & projet 7b",
      scheduledDate: "2026-10-16",
    });
  });

  it("préfère le débrief à la séance quand les deux sont posés", async () => {
    const { db } = fakeDb([{ id: "f1", scheduledSessionId: "s1" }], [SESSION]);
    const resolved = await new MessageAttachmentResolver(db).resolve([
      message({ id: "m1", scheduledSessionId: "s1", sessionFeedbackId: "f1" }),
    ]);

    expect(resolved.get("m1")?.type).toBe(MessageAttachmentType.SESSION_FEEDBACK);
  });

  /**
   * LA propriété du multi-tenant, vérifiée ici plutôt qu'espérée : la cible est relue par le
   * client scopé, donc un id qu'on n'a pas le droit de lire ne rend rien — et le message redevient
   * une bulle nue. C'est exactement ce qu'un `include` imbriqué casserait en silence.
   */
  it("ne rend aucun libellé quand la cible est hors de portée ou supprimée", async () => {
    const { db } = fakeDb([], []);
    const resolved = await new MessageAttachmentResolver(db).resolve([
      message({ id: "m1", scheduledSessionId: "s-autre-relation" }),
      message({ id: "m2", sessionFeedbackId: "f-autre-relation" }),
    ]);

    expect(resolved.size).toBe(0);
  });

  // Un fil peut compter des centaines de messages : une requête par message ferait du rendu d'un
  // fil un problème de base de données. Deux requêtes au total, quel que soit le nombre.
  it("charge les cibles en lot, sans doublon d'id", async () => {
    const { db, findFeedbacks, findSessions } = fakeDb(
      [{ id: "f1", scheduledSessionId: "s1" }],
      [SESSION],
    );
    await new MessageAttachmentResolver(db).resolve([
      message({ id: "m1", scheduledSessionId: "s1" }),
      message({ id: "m2", scheduledSessionId: "s1" }),
      message({ id: "m3", sessionFeedbackId: "f1" }),
      message({ id: "m4", sessionFeedbackId: "f1" }),
    ]);

    expect(findFeedbacks).toHaveBeenCalledTimes(1);
    expect(findSessions).toHaveBeenCalledTimes(1);
    expect(requestedIds(findFeedbacks)).toEqual(["f1"]);
    // La séance du débrief et la séance citée sont la même : un seul id demandé.
    expect(requestedIds(findSessions)).toEqual(["s1"]);
  });
});
