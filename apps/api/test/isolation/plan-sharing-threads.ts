import { MessageType } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { billAndPublish } from "../support/actors";
import { grantPlan, type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";

/**
 * Les fils et la boîte des débriefs autour d'une planification partagée (#607). Un message peut
 * citer une séance ou un débrief si la cible est de l'athlète du fil et que le coach du fil la lit
 * — qu'il écrive lui-même, ou que l'athlète lui écrive. La boîte des débriefs, elle, reste au
 * propriétaire du cycle jusqu'à #610. Comptes `plan-share-msg-`.
 */
describe("Fils et débriefs d'un cycle partagé : la séance citée doit se lire du coach du fil", () => {
  let world: SharedPlanWorld;
  let feedbackId: string;
  let threadM: string;

  const cite = (threadId: string, as: "m" | "ti", target: Record<string, string>) =>
    world[as]
      .post(`/conversations/${threadId}/messages`)
      .send({ type: MessageType.TEXT, content: "À propos de ça", ...target });

  beforeAll(async () => {
    world = await sharedPlanWorld("plan-share-msg");
    expect((await billAndPublish(world.c, world.planTi.id)).status).toBe(200);
    const debrief = await world.ti
      .put(`/me/scheduled-sessions/${world.planTi.sessionId}/feedback`)
      .send({ content: "Faite, mais dure" });
    expect(debrief.status).toBe(200);
    feedbackId = debrief.body.id;

    const thread = await world.ti.post("/conversations").send({ coachId: world.ids.m });
    expect(thread.status).toBe(201);
    threadM = thread.body.id;
  });

  it("cycle fermé : ni M ni TI ne citent la séance de C dans leur fil", async () => {
    await grantPlan(world, world.planTi.id, null);
    const session = { scheduledSessionId: world.planTi.sessionId };
    const feedback = { sessionFeedbackId: feedbackId };

    const attempts = await Promise.all([
      cite(threadM, "m", session),
      cite(threadM, "m", feedback),
      // TI lit sa séance — mais M, à qui il écrit, ne la lit pas.
      cite(threadM, "ti", session),
      cite(threadM, "ti", feedback),
    ]);
    expect(attempts.map((res) => res.status)).toEqual([400, 400, 400, 400]);
  });

  it("cycle ouvert en Lecture : M et TI la citent, et le fil la nomme", async () => {
    await grantPlan(world, world.planTi.id, "READ");

    const fromM = await cite(threadM, "m", { scheduledSessionId: world.planTi.sessionId });
    expect(fromM.status).toBe(201);
    const fromTi = await cite(threadM, "ti", { sessionFeedbackId: feedbackId });
    expect(fromTi.status).toBe(201);

    const thread = await world.m.get(`/conversations/${threadM}/messages`);
    const titles = thread.body
      .map((message: { attachment: { sessionTitle: string } | null }) => message.attachment)
      .filter((attachment: unknown) => attachment != null)
      .map((attachment: { sessionTitle: string }) => attachment.sessionTitle);
    expect(titles).toEqual(["Séance de TI", "Séance de TI"]);
  });

  it("M lit le débrief dans le cycle, mais la boîte reste celle de C", async () => {
    const inCycle = await world.m.get(`/scheduled-sessions/${world.planTi.sessionId}/feedback`);
    expect(inCycle.status).toBe(200);
    expect(inCycle.body.id).toBe(feedbackId);

    const inboxM = (await world.m.get("/feedbacks")).body as { id: string }[];
    expect(inboxM.map((feedback) => feedback.id)).not.toContain(feedbackId);
    expect((await world.m.post(`/feedbacks/${feedbackId}/read`)).status).toBe(404);

    const inboxC = (await world.c.get("/feedbacks")).body as { id: string }[];
    expect(inboxC.map((feedback) => feedback.id)).toContain(feedbackId);
    expect((await world.c.post(`/feedbacks/${feedbackId}/read`)).body.coachReadAt).not.toBeNull();
  });
});
