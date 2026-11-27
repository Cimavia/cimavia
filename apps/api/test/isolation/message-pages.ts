import { MESSAGE_PAGE_SIZE, type MessagePageDto, Role } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { encodeCursor } from "../../src/util/cursor-page.util";
import { type Agent, idOf, linkRelation, openWith, signUp } from "../support/actors";
import { app } from "../support/app";

/**
 * Le fil servi par pages (#77). Les messages sont posés en base, et non envoyés : il en faut plus
 * de deux pages, à des dates choisies — dont QUATRE à la même milliseconde, à cheval sur la
 * frontière des 50 plus récents. C'est le cas que `createdAt` seul ne sait pas trancher.
 */
describe("Messagerie : le fil par pages (#77)", () => {
  const TOTAL = 120;
  // Les 50 plus récents sont les rangs 70 à 119 : 68 à 71 partagent leur date, deux de chaque côté.
  const TIED = new Set([68, 69, 70, 71]);
  const BASE = Date.UTC(2026, 9, 1, 8, 0, 0);
  const idAt = (rank: number) => `pg77-${String(rank).padStart(3, "0")}`;
  const dateAt = (rank: number) => new Date(BASE + (TIED.has(rank) ? 68 : rank) * 1000);

  let coach: Agent;
  let athlete: Agent;
  let outsider: Agent;
  let conversationId: string;
  let outsiderConversationId: string;

  const page = async (agent: Agent, id: string, query = "") => {
    const response = await agent.get(`/conversations/${id}/messages${query}`);
    return { status: response.status, body: response.body as MessagePageDto };
  };

  /** Tout le fil, en remontant page par page comme le fait un client. */
  const walk = async (agent: Agent, id: string, limit: number) => {
    const pages: MessagePageDto[] = [];
    let before: string | null = null;
    do {
      const cursor: string = before == null ? "" : `&before=${before}`;
      const { status, body } = await page(agent, id, `?limit=${limit}${cursor}`);
      expect(status).toBe(200);
      pages.push(body);
      before = body.nextCursor;
    } while (before != null && pages.length <= TOTAL);
    return pages;
  };

  beforeAll(async () => {
    coach = await signUp("pages-coach@cmv.test", Role.COACH);
    athlete = await signUp("pages-athlete@cmv.test", Role.ATHLETE);
    const { athleteId } = await linkRelation(coach, athlete);
    conversationId = (await openWith(coach, athleteId, "athlete")).body.id;

    outsider = await signUp("pages-outsider@cmv.test", Role.COACH);
    const other = await signUp("pages-other-athlete@cmv.test", Role.ATHLETE);
    const otherRelation = await linkRelation(outsider, other);
    outsiderConversationId = (await openWith(outsider, otherRelation.athleteId, "athlete")).body.id;

    const coachId = await idOf(coach);
    await app.get(PrismaService).message.createMany({
      data: Array.from({ length: TOTAL }, (_, rank) => ({
        id: idAt(rank),
        conversationId,
        senderId: coachId,
        type: "TEXT" as const,
        content: `message ${rank}`,
        createdAt: dateAt(rank),
      })),
    });
  });

  it("sert d'abord les 50 plus récents, dans l'ordre chronologique", async () => {
    const { status, body } = await page(athlete, conversationId);

    expect(status).toBe(200);
    expect(body.items).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(body.items.map(({ id }) => id)).toEqual(
      Array.from({ length: MESSAGE_PAGE_SIZE }, (_, i) => idAt(TOTAL - MESSAGE_PAGE_SIZE + i)),
    );
    expect(body.nextCursor).not.toBeNull();
  });

  /**
   * Le piège de l'issue : à dates égales, un curseur sur `createdAt` seul sauterait (ou
   * répéterait) les messages de la même milliseconde de part et d'autre de la frontière.
   */
  it("remonte tout le fil sans trou ni doublon, égalités de date comprises", async () => {
    // Chaque taille coupe le groupe des quatre ex æquo ailleurs : 69|70, 70|71 et 68|69.
    for (const limit of [MESSAGE_PAGE_SIZE, 7, 3]) {
      const pages = await walk(athlete, conversationId, limit);
      const read = pages.toReversed().flatMap(({ items }) => items.map(({ id }) => id));
      expect(read).toEqual(Array.from({ length: TOTAL }, (_, rank) => idAt(rank)));
      expect(pages.at(-1)?.nextCursor).toBeNull();
    }
  });

  it("ne décale pas la page d'avant quand un message arrive pendant la remontée", async () => {
    const first = await page(athlete, conversationId, "?limit=10");
    const sent = await athlete
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Arrivé pendant la lecture" });
    expect(sent.status).toBe(201);

    const second = await page(athlete, conversationId, `?limit=10&before=${first.body.nextCursor}`);

    expect(second.body.items.map(({ id }) => id)).toEqual(
      Array.from({ length: 10 }, (_, i) => idAt(TOTAL - 20 + i)),
    );
    const latest = await page(athlete, conversationId, "?limit=1");
    expect(latest.body.items[0]?.id).toBe(sent.body.id);
  });

  /**
   * Le sondage relit la page la plus récente depuis sa frontière : en entier, ce qui est arrivé
   * compris, et sous le même curseur — la page d'avant se relit donc à l'identique.
   */
  it("relit la page la plus récente depuis sa frontière, ce qui est arrivé compris", async () => {
    const first = await page(athlete, conversationId, "?limit=10");
    const sent = await athlete
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Arrivé pendant le sondage" });
    expect(sent.status).toBe(201);

    const { status, body } = await page(athlete, conversationId, `?since=${first.body.nextCursor}`);

    expect(status).toBe(200);
    expect(body.items.map(({ id }) => id)).toEqual([
      ...first.body.items.map(({ id }) => id),
      sent.body.id,
    ]);
    expect(body.nextCursor).toBe(first.body.nextCursor);
  });

  it("rend la page la plus récente, à son curseur, quand la relecture dépasse le plafond", async () => {
    const since = encodeCursor({ createdAt: dateAt(0), id: idAt(0) });

    const { status, body } = await page(athlete, conversationId, `?since=${since}`);

    expect(status).toBe(200);
    expect(body.items).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(body.nextCursor).not.toBeNull();
    expect(body.nextCursor).not.toBe(since);
    const latest = await page(athlete, conversationId);
    expect(body).toEqual(latest.body);
  });

  /**
   * Les non-lus et la marque de lecture se lisent sur la table, pas sur la page chargée : un fil
   * ouvert sur sa dernière page marque lu jusqu'au dernier message, et la liste a compté ce que la
   * page ne montrait pas.
   */
  it("compte les non-lus au-delà de la page, et marque lu jusqu'au dernier message", async () => {
    const listed = async () =>
      (await athlete.get("/conversations")).body.find(
        (conversation: { id: string }) => conversation.id === conversationId,
      ) as { unreadCount: number };

    expect((await listed()).unreadCount).toBe(TOTAL);
    expect((await athlete.post(`/conversations/${conversationId}/read`)).status).toBe(204);
    expect((await listed()).unreadCount).toBe(0);
  });

  it("rend une page vide, sans curseur, pour un fil sans message", async () => {
    const { status, body } = await page(outsider, outsiderConversationId);
    expect(status).toBe(200);
    expect(body).toEqual({ items: [], nextCursor: null });
  });

  it("garde le titre exercé à côté de la pagination", async () => {
    const { status, body } = await page(coach, conversationId, "?as=coach&limit=2");
    expect(status).toBe(200);
    expect(body.items).toHaveLength(2);
  });

  describe("isolation", () => {
    /**
     * Un curseur est une POSITION, pas une ligne à relire : pris dans le fil d'un autre, il ne
     * désigne qu'un instant — appliqué au sien, il ne rend que les siens.
     */
    it("un curseur forgé sur le fil d'un autre ne rend que les messages du sien", async () => {
      const own = await outsider
        .post(`/conversations/${outsiderConversationId}/messages`)
        .send({ type: "TEXT", content: "Le seul de mon fil" });
      expect(own.status).toBe(201);
      // Un id du fil de l'autre, à une date postérieure à tout : son propre fil est « avant ».
      const forged = encodeCursor({ createdAt: new Date(Date.now() + 60_000), id: idAt(TOTAL) });

      const { status, body } = await page(outsider, outsiderConversationId, `?before=${forged}`);

      expect(status).toBe(200);
      expect(body.items.map(({ id }) => id)).toEqual([own.body.id]);

      // Une relecture depuis le début des temps, idem : rien que le sien, et rien avant.
      const epoch = encodeCursor({ createdAt: new Date(0), id: idAt(0) });
      const since = await page(outsider, outsiderConversationId, `?since=${epoch}`);
      expect(since.status).toBe(200);
      expect(since.body).toEqual({ items: [own.body], nextCursor: null });
    });

    it("le fil d'un autre reste introuvable, avec ou sans curseur (404)", async () => {
      const cursor = encodeCursor({ createdAt: dateAt(60), id: idAt(60) });
      expect((await page(outsider, conversationId)).status).toBe(404);
      expect((await page(outsider, conversationId, `?before=${cursor}`)).status).toBe(404);
      expect((await page(outsider, conversationId, `?since=${cursor}`)).status).toBe(404);
    });
  });

  describe("requête refusée (400)", () => {
    it.each([
      ["un curseur qui ne vient pas de l'API", "?before=bm9uLWN1cnNldXI"],
      ["un curseur hors du format base64url", "?before=a%2Bb"],
      ["une relecture au curseur illisible", "?since=bm9uLWN1cnNldXI"],
      ["une page d'avant ET une relecture", "?before=YWJj&since=YWJj"],
      ["une taille nulle", "?limit=0"],
      ["une taille au-delà du plafond", "?limit=101"],
      ["une taille illisible", "?limit=beaucoup"],
    ])("%s", async (_, query) => {
      expect((await page(athlete, conversationId, query)).status).toBe(400);
    });
  });
});
