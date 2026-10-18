import { MessageType } from "@cmv/shared";
import { type Conversation, type ConversationParticipant, Prisma } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { UserDirectoryService } from "../../account/service/user-directory.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { TenantContext } from "../../tenancy/tenant-context.type";
import { ConversationService } from "./conversation.service";
import type { ConversationCandidateService } from "./conversation-candidate.service";

const COACH: TenantContext = {
  userId: "c1",
  capabilities: { isCoach: true, isAthlete: false, isCompany: false },
  exercised: "coach",
};

const DIRECT_KEY = "ATHLETE:a1|COACH:c1";

const conversation = (id: string, overrides: Partial<Conversation> = {}): Conversation => ({
  id,
  kind: "DIRECT",
  participantKey: DIRECT_KEY,
  lastMessageAt: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-01T08:00:00Z"),
  ...overrides,
});

const participant = (
  conversationId: string,
  userId: string,
  capability: "COACH" | "ATHLETE",
  lastReadAt: Date | null = null,
): ConversationParticipant => ({
  id: `${conversationId}-${userId}`,
  conversationId,
  userId,
  capability,
  lastReadAt,
  createdAt: new Date("2026-10-01T08:00:00Z"),
});

const NAMES = new Map([
  ["c1", "Chloé"],
  ["m1", "Marc"],
  ["a1", "Théo"],
  ["a2", "Inès"],
]);

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });

type Rows = {
  conversations?: Conversation[];
  participants?: ConversationParticipant[];
  lastMessages?: unknown[];
  unread?: { conversationId: string; _count: { _all: number } }[];
};

/** Un faux client tenant : il rend ce qu'on lui donne, et l'on regarde ce qu'on lui demande. */
function build(rows: Rows = {}, options: { reachable?: boolean } = {}) {
  const participants = rows.participants ?? [];
  const db = {
    conversation: {
      findMany: vi.fn().mockResolvedValue(rows.conversations ?? []),
      findFirst: vi.fn().mockResolvedValue(rows.conversations?.[0] ?? null),
      findUnique: vi.fn().mockResolvedValue(rows.conversations?.[0] ?? null),
      create: vi.fn(),
    },
    conversationParticipant: {
      findMany: vi.fn(async ({ where }: { where: { conversationId: { in: string[] } } }) =>
        participants.filter((p) => where.conversationId.in.includes(p.conversationId)),
      ),
    },
    message: {
      findMany: vi.fn().mockResolvedValue(rows.lastMessages ?? []),
      groupBy: vi.fn().mockResolvedValue(rows.unread ?? []),
    },
  };
  const reachesAll = vi.fn().mockResolvedValue(options.reachable ?? true);
  const service = new ConversationService(
    db as unknown as TenantPrisma,
    { namesByIds: vi.fn().mockResolvedValue(NAMES) } as unknown as UserDirectoryService,
    { reachesAll } as unknown as ConversationCandidateService,
    { get: () => COACH } as unknown as ClsService,
  );
  return { service, db, reachesAll };
}

describe("ConversationService.create", () => {
  it("refuse de se nommer soi-même, même sous l'autre capacité (409)", async () => {
    const { service, reachesAll } = build();

    await expect(
      service.create({ participants: [{ userId: "c1", capability: "athlete" }] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(reachesAll).not.toHaveBeenCalled();
  });

  it("refuse un participant que l'acteur ne peut pas réunir (400)", async () => {
    const { service, db } = build({}, { reachable: false });

    await expect(
      service.create({ participants: [{ userId: "a9", capability: "athlete" }] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("vérifie chaque participant à son titre", async () => {
    const { service, reachesAll } = build({
      conversations: [conversation("g1")],
      participants: [participant("g1", "c1", "COACH")],
    });

    await service.create({
      participants: [
        { userId: "a1", capability: "athlete" },
        { userId: "m1", capability: "coach" },
      ],
    });

    expect(reachesAll).toHaveBeenCalledExactlyOnceWith([
      { userId: "a1", capability: "ATHLETE" },
      { userId: "m1", capability: "COACH" },
    ]);
  });

  it("crée à trois une conversation GROUP, l'acteur parmi ses participants", async () => {
    const { service, db } = build({ participants: [participant("g1", "c1", "COACH")] });
    db.conversation.findUnique.mockResolvedValue(null);
    db.conversation.create.mockResolvedValue(conversation("g1", { kind: "GROUP" }));

    await service.create({
      participants: [
        { userId: "m1", capability: "coach" },
        { userId: "a1", capability: "athlete" },
      ],
    });

    expect(db.conversation.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        kind: "GROUP",
        participantKey: "ATHLETE:a1|COACH:c1|COACH:m1",
        participants: {
          create: [
            { userId: "c1", capability: "COACH" },
            { userId: "m1", capability: "COACH" },
            { userId: "a1", capability: "ATHLETE" },
          ],
        },
      },
    });
  });

  // Mêmes participants, même conversation : la rouvrir ne la recrée pas.
  it("rend la conversation qui réunit déjà ces participants", async () => {
    const { service, db } = build({
      conversations: [conversation("d1")],
      participants: [participant("d1", "c1", "COACH"), participant("d1", "a1", "ATHLETE")],
    });

    const dto = await service.create({ participants: [{ userId: "a1", capability: "athlete" }] });

    expect(dto.id).toBe("d1");
    expect(db.conversation.findUnique).toHaveBeenCalledWith({
      where: { participantKey: DIRECT_KEY },
    });
    expect(db.conversation.create).not.toHaveBeenCalled();
  });
});

describe("ConversationService — vue de l'acteur", () => {
  const GROUP = conversation("g1", {
    kind: "GROUP",
    lastMessageAt: new Date("2026-10-03T09:00:00Z"),
  });
  const READ_AT = new Date("2026-10-02T10:00:00Z");
  const groupParticipants = [
    participant("g1", "c1", "COACH", READ_AT),
    participant("g1", "m1", "COACH", new Date("2026-10-03T09:30:00Z")),
    participant("g1", "a2", "ATHLETE"),
  ];

  it("nomme les AUTRES participants, rangés par nom, avec leur marque de lecture", async () => {
    const { service } = build({
      conversations: [GROUP],
      participants: groupParticipants,
      lastMessages: [
        { conversationId: "g1", senderId: "m1", type: MessageType.TEXT, content: "On cale ça ?" },
      ],
      unread: [{ conversationId: "g1", _count: { _all: 2 } }],
    });

    const [dto] = await service.list();

    expect(dto).toEqual({
      id: "g1",
      kind: "GROUP",
      participants: [
        { userId: "a2", name: "Inès", capability: "athlete", lastReadAt: null },
        {
          userId: "m1",
          name: "Marc",
          capability: "coach",
          lastReadAt: "2026-10-03T09:30:00.000Z",
        },
      ],
      lastReadAt: READ_AT.toISOString(),
      lastMessageAt: "2026-10-03T09:00:00.000Z",
      lastMessageSenderId: "m1",
      lastMessageType: MessageType.TEXT,
      lastMessagePreview: "On cale ça ?",
      unreadCount: 2,
      createdAt: "2026-10-01T08:00:00.000Z",
    });
  });

  // Les messages des autres, après MA marque — tous, si je n'ai encore rien lu.
  it("compte les non-lus depuis la marque de lecture de l'acteur", async () => {
    const UNREAD = conversation("d1");
    const { service, db } = build({
      conversations: [GROUP, UNREAD],
      participants: [
        ...groupParticipants,
        participant("d1", "c1", "COACH"),
        participant("d1", "a1", "ATHLETE"),
      ],
    });

    await service.list();

    expect(db.message.groupBy).toHaveBeenCalledWith({
      by: ["conversationId"],
      where: {
        senderId: { not: "c1" },
        OR: [{ conversationId: "g1", createdAt: { gt: READ_AT } }, { conversationId: "d1" }],
      },
      _count: { _all: true },
    });
  });

  it("rend zéro non-lu, et aucun aperçu, à une conversation encore vide", async () => {
    const { service } = build({
      conversations: [conversation("d1")],
      participants: [participant("d1", "c1", "COACH"), participant("d1", "a1", "ATHLETE")],
    });

    const [dto] = await service.list();

    expect(dto).toMatchObject({
      unreadCount: 0,
      lastMessageAt: null,
      lastMessageSenderId: null,
      lastMessageType: null,
      lastMessagePreview: null,
    });
  });

  it("ne donne pas d'aperçu texte à un média", async () => {
    const { service } = build({
      conversations: [GROUP],
      participants: groupParticipants,
      lastMessages: [{ conversationId: "g1", senderId: "a2", type: MessageType.IMAGE }],
    });

    const [dto] = await service.list();

    expect(dto?.lastMessagePreview).toBeNull();
    expect(dto?.lastMessageType).toBe(MessageType.IMAGE);
  });

  // Une conversation qui vient d'être créée passe devant une autre restée muette depuis.
  it("range par activité, une conversation sans message à sa création", async () => {
    const OLD = conversation("old", { lastMessageAt: new Date("2026-09-20T08:00:00Z") });
    const FRESH = conversation("fresh", { createdAt: new Date("2026-10-05T08:00:00Z") });
    const { service } = build({
      conversations: [OLD, GROUP, FRESH],
      participants: ["old", "g1", "fresh"].flatMap((id) => [
        participant(id, "c1", "COACH"),
        participant(id, "a1", "ATHLETE"),
      ]),
    });

    const dtos = await service.list();

    expect(dtos.map((dto) => dto.id)).toEqual(["fresh", "g1", "old"]);
  });

  it("ne lance aucune requête de plus sans conversation", async () => {
    const { service, db } = build();

    await expect(service.list()).resolves.toEqual([]);
    expect(db.conversationParticipant.findMany).not.toHaveBeenCalled();
    expect(db.message.groupBy).not.toHaveBeenCalled();
  });
});

describe("ConversationService.getJoinedOrThrow", () => {
  it("rend la conversation avec tous ses participants, l'acteur compris", async () => {
    const participants = [participant("d1", "c1", "COACH"), participant("d1", "a1", "ATHLETE")];
    const { service } = build({ conversations: [conversation("d1")], participants });

    await expect(service.getJoinedOrThrow("d1")).resolves.toEqual({
      ...conversation("d1"),
      participants,
    });
  });

  it("rend 404 quand l'acteur n'y participe pas", async () => {
    const { service } = build();

    await expect(service.getJoinedOrThrow("autre")).rejects.toMatchObject({ status: 404 });
  });
});

describe("ConversationService.findDirect", () => {
  it("cherche le fil direct par sa clé, sans le créer", async () => {
    const { service, db } = build();
    db.conversation.findUnique.mockResolvedValue(null);

    await expect(service.findDirect("c1", "a1")).resolves.toBeNull();
    expect(db.conversation.findUnique).toHaveBeenCalledWith({
      where: { participantKey: DIRECT_KEY },
    });
    expect(db.conversation.create).not.toHaveBeenCalled();
  });
});

/**
 * Deux ouvertures simultanées du même fil — le coach et l'athlète au même instant, ou un avis de
 * débrief (#96) qui croise l'ouverture de l'écran. Le second `create` viole l'unicité
 * `participantKey`. Les e2e, séquentiels, ne produisent jamais cette course.
 */
describe("ConversationService.ensure — la course à la création", () => {
  const THREAD = conversation("d1");
  const PARTICIPANTS = [participant("d1", "c1", "COACH"), participant("d1", "a1", "ATHLETE")];

  function racing(create: () => Promise<unknown>, reread: Conversation | null) {
    const built = build({ participants: PARTICIPANTS });
    built.db.conversation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(reread);
    built.db.conversation.create.mockImplementation(create);
    return built;
  }

  it("crée le fil direct, DIRECT, avec le Coach et l'athlète", async () => {
    const { service, db } = racing(() => Promise.resolve(THREAD), null);

    await expect(service.ensure("c1", "a1")).resolves.toEqual({
      ...THREAD,
      participants: PARTICIPANTS,
    });
    expect(db.conversation.create).toHaveBeenCalledWith({
      data: {
        kind: "DIRECT",
        participantKey: DIRECT_KEY,
        participants: {
          create: [
            { userId: "c1", capability: "COACH" },
            { userId: "a1", capability: "ATHLETE" },
          ],
        },
      },
    });
  });

  it("relit et rend le fil que l'autre ouverture vient de créer", async () => {
    const { service, db } = racing(() => Promise.reject(uniqueViolation()), THREAD);

    await expect(service.ensure("c1", "a1")).resolves.toEqual({
      ...THREAD,
      participants: PARTICIPANTS,
    });
    expect(db.conversation.findUnique).toHaveBeenLastCalledWith({
      where: { participantKey: DIRECT_KEY },
    });
  });

  // Violation d'unicité, et pourtant rien à relire : l'état est incohérent, on ne l'invente pas.
  it("laisse remonter la violation quand le fil reste introuvable", async () => {
    const violation = uniqueViolation();
    const { service } = racing(() => Promise.reject(violation), null);

    await expect(service.ensure("c1", "a1")).rejects.toBe(violation);
  });

  it("laisse remonter toute autre erreur sans relire", async () => {
    const outage = new Error("connexion perdue");
    const { service, db } = racing(() => Promise.reject(outage), THREAD);

    await expect(service.ensure("c1", "a1")).rejects.toBe(outage);
    expect(db.conversation.findUnique).toHaveBeenCalledTimes(1);
  });

  it("laisse remonter une erreur Prisma qui n'est pas une violation d'unicité", async () => {
    const fkViolation = new Prisma.PrismaClientKnownRequestError("Foreign key", {
      code: "P2003",
      clientVersion: "test",
    });
    const { service, db } = racing(() => Promise.reject(fkViolation), THREAD);

    await expect(service.ensure("c1", "a1")).rejects.toBe(fkViolation);
    expect(db.conversation.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe("ConversationService.candidatesOf", () => {
  it("rend ceux que l'acteur peut réunir", async () => {
    const candidates = { athletes: [], coaches: [] };
    const service = new ConversationService(
      {} as TenantPrisma,
      {} as UserDirectoryService,
      { list: vi.fn().mockResolvedValue(candidates) } as unknown as ConversationCandidateService,
      {} as ClsService,
    );

    await expect(service.candidatesOf()).resolves.toBe(candidates);
  });
});
