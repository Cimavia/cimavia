import { type ConversationDto, directCounterpartId, MessageType } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish } from "../support/actors";
import { grantPlan, type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";

type Summary = {
  id: string;
  coachReadAt: string | null;
  firstReply: { coachId: string; coachName: string } | null;
};
type ThreadMessage = { type: string; content: string | null; sessionFeedbackId: string | null };

/**
 * Les débriefs d'une planification partagée (#610) : notifiés à chaque Coach qui la lit, et lus par
 * chacun. C possède le cycle de TI et l'ouvre en Lecture à F, dont M est Coach : C et M sont
 * prévenus, chacun dans son fil avec TI. B suit TI hors de F, N est de F sans suivre TI : ni l'un
 * ni l'autre. Le cycle de TE, que C seul suit, ne prévient que C. Comptes `plan-share-fbk-`.
 */
describe("Débriefs d'un cycle partagé : notifiés à chaque Coach, lus par chacun", () => {
  let world: SharedPlanWorld;
  let feedbackId: string;

  const debrief = (content: string) =>
    world.ti.put(`/me/scheduled-sessions/${world.planTi.sessionId}/feedback`).send({ content });

  const inbox = async (coach: Agent) => (await coach.get("/feedbacks")).body as Summary[];
  const summaryOf = async (coach: Agent, id: string) =>
    (await inbox(coach)).find((summary) => summary.id === id);

  /** Le fil direct du Coach avec un athlète, ou `undefined` s'il n'en a pas. */
  const threadWith = async (coach: Agent, athleteId: string) => {
    const threads = (await coach.get("/conversations")).body as ConversationDto[];
    return threads.find((thread) => directCounterpartId(thread, "athlete") === athleteId);
  };
  const messagesOf = async (coach: Agent, threadId: string) =>
    (await coach.get(`/conversations/${threadId}/messages`)).body as ThreadMessage[];
  const noticesIn = async (coach: Agent, athleteId: string, id: string) => {
    const thread = await threadWith(coach, athleteId);
    if (thread == null) return [];
    return (await messagesOf(coach, thread.id))
      .filter((message) => message.sessionFeedbackId === id && message.type !== MessageType.TEXT)
      .map((message) => message.type);
  };
  const feedbackTraces = async (coach: Agent) =>
    ((await coach.get("/me/notifications")).body as { type: string }[]).filter(
      (notification) => notification.type === "FEEDBACK_RECEIVED",
    ).length;

  beforeAll(async () => {
    world = await sharedPlanWorld("plan-share-fbk");
    await grantPlan(world, world.planTi.id, "READ");
    expect((await billAndPublish(world.c, world.planTi.id)).status).toBe(200);

    const res = await debrief("Faite, mais dure");
    expect(res.status).toBe(200);
    feedbackId = res.body.id;
  });

  it("TI débriefe : C et M reçoivent l'avis, chacun dans son fil direct avec TI", async () => {
    expect(await noticesIn(world.c, world.ids.ti, feedbackId)).toEqual([
      MessageType.FEEDBACK_CREATED,
    ]);
    expect(await noticesIn(world.m, world.ids.ti, feedbackId)).toEqual([
      MessageType.FEEDBACK_CREATED,
    ]);
    expect(await feedbackTraces(world.m)).toBe(1);
  });

  it("ni B, qui suit TI hors de F, ni N, de F sans suivre TI, ne sont prévenus", async () => {
    for (const coach of [world.b, world.n]) {
      expect(await noticesIn(coach, world.ids.ti, feedbackId)).toEqual([]);
      expect(await feedbackTraces(coach)).toBe(0);
      expect(await summaryOf(coach, feedbackId)).toBeUndefined();
      expect((await coach.post(`/feedbacks/${feedbackId}/read`)).status).toBe(404);
    }
  });

  it("C lit le débrief : M le voit toujours à relire", async () => {
    expect((await summaryOf(world.m, feedbackId))?.coachReadAt).toBeNull();

    const read = await world.c.post(`/feedbacks/${feedbackId}/read`);
    expect(read.status).toBe(201);
    expect(read.body.coachReadAt).not.toBeNull();

    expect((await summaryOf(world.c, feedbackId))?.coachReadAt).toBe(read.body.coachReadAt);
    expect((await summaryOf(world.m, feedbackId))?.coachReadAt).toBeNull();
  });

  it("M lit à son tour, sans redater la lecture de C", async () => {
    const before = (await summaryOf(world.c, feedbackId))?.coachReadAt;
    expect((await world.m.post(`/feedbacks/${feedbackId}/read`)).body.coachReadAt).not.toBeNull();
    expect((await summaryOf(world.c, feedbackId))?.coachReadAt).toBe(before);
  });

  it("TI complète son débrief : il redevient à relire chez C comme chez M", async () => {
    expect((await debrief("Faite, mais dure. Genou sensible.")).status).toBe(200);

    expect((await summaryOf(world.c, feedbackId))?.coachReadAt).toBeNull();
    expect((await summaryOf(world.m, feedbackId))?.coachReadAt).toBeNull();
  });

  it("M répond depuis son fil : C voit « répondu par M », pas le contenu", async () => {
    const thread = await threadWith(world.m, world.ids.ti);
    const reply = await world.m.post(`/conversations/${thread?.id}/messages`).send({
      type: MessageType.TEXT,
      content: "Lève le pied demain",
      sessionFeedbackId: feedbackId,
    });
    expect(reply.status).toBe(201);

    const seenByC = await summaryOf(world.c, feedbackId);
    expect(seenByC?.firstReply).toMatchObject({
      coachId: world.ids.m,
      coachName: "plan-share-fbk-m@cmv.test",
    });
    expect((await summaryOf(world.m, feedbackId))?.firstReply?.coachId).toBe(world.ids.m);

    // Le contenu reste dans le fil de M : le débrief, lu par C, ne le rend pas.
    const detail = await world.c.get(`/scheduled-sessions/${world.planTi.sessionId}/feedback`);
    expect(detail.body.messages).toEqual([]);
  });

  it("le cycle refermé, M ne le lit plus : ni boîte, ni nouvel avis", async () => {
    // L'avis de M lu : s'il était encore destinataire, le complément suivant en poserait un autre.
    const thread = await threadWith(world.m, world.ids.ti);
    expect((await world.m.post(`/conversations/${thread?.id}/read`)).status).toBe(204);
    await grantPlan(world, world.planTi.id, null);

    expect((await debrief("Et une douleur au pied.")).status).toBe(200);

    expect(await summaryOf(world.m, feedbackId)).toBeUndefined();
    expect(await noticesIn(world.m, world.ids.ti, feedbackId)).toEqual([
      MessageType.FEEDBACK_CREATED,
    ]);
  });

  it("TE débriefe : seul C est prévenu", async () => {
    const session = await world.c
      .post(`/plan-weeks/${world.planTe.weekId}/sessions`)
      .send({ title: "Séance de TE", scheduledDate: world.monday });
    expect(session.status).toBe(201);
    expect((await billAndPublish(world.c, world.planTe.id)).status).toBe(200);
    const teId = (await world.te.get("/api/auth/get-session")).body.user.id as string;
    const before = await feedbackTraces(world.m);

    const res = await world.te
      .put(`/me/scheduled-sessions/${session.body.id}/feedback`)
      .send({ content: "Rien à signaler" });
    expect(res.status).toBe(200);

    expect(await noticesIn(world.c, teId, res.body.id)).toEqual([MessageType.FEEDBACK_CREATED]);
    expect(await summaryOf(world.c, res.body.id)).toBeDefined();
    expect(await summaryOf(world.m, res.body.id)).toBeUndefined();
    expect(await feedbackTraces(world.m)).toBe(before);
  });
});
