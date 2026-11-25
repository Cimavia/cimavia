import {
  type CoachAthleteDto,
  CoachAthleteStatus,
  type ConversationDto,
  InvitationRole,
  InvoiceStatus,
  MessageType,
  ProblemType,
  type ReminderDto,
  ReminderStatus,
  Role,
} from "@cmv/shared";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import {
  type Agent,
  billAndPublish,
  emailOf,
  idOf,
  inviteFor,
  link,
  openWith,
  required,
  signUp,
} from "../support/actors";
import { app, baseURL } from "../support/app";
import { fromTemplate } from "../support/fixtures";
import { grantPlan, type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";
import { deleteAtLatest, patchAtLatest } from "../support/version";

/** Le refus d'une écriture dans l'archive d'un suivi terminé. */
function expectFollowEnded(res: { status: number; body: { type?: unknown } }): void {
  expect(res.status).toBe(409);
  expect(res.body.type).toBe(ProblemType.FOLLOW_ENDED);
}

type NotificationRow = { type: string; entityType: string; entityId: string };
const noticesOf = async (agent: Agent, type: string) =>
  ((await agent.get("/me/notifications")).body as NotificationRow[]).filter(
    (notification) => notification.type === type,
  );

// Le cron, sans session : le secret fixé par `vitest.config.e2e.ts`.
const tick = () =>
  request(baseURL)
    .post("/internal/reminders/tick")
    .set("x-cimavia-tick-secret", "e2e-tick-secret-not-for-production");

/**
 * Rompre un lien coach↔athlète (#909), sans rien effacer (tranché en #213) : le lien passe à ENDED,
 * et tout ce que le couple a produit se RELIT et ne s'ÉCRIT plus — par personne, l'autre Coach à
 * qui le cycle était ouvert en Écriture compris. Une réinvitation rouvre tout.
 *
 * C possède le cycle de TI, diffusé et ouvert en Écriture à F, dont M est Coach. TI l'a débriefé,
 * C et TI se sont écrit, C a rédigé la fiche de TI. Puis C met fin au suivi. Comptes
 * `relation-end-`.
 */
describe("Rupture d'un lien : l'archive se relit, et ne s'écrit plus", () => {
  let world: SharedPlanWorld;
  let invoiceId: string;
  let threadId: string;
  let ended: CoachAthleteDto;
  // Des envois commencés avant la rupture : ils ne se recollent plus après.
  let debriefUpload: string;
  let messageUpload: string;

  const sessionPath = () => `/me/scheduled-sessions/${world.planTi.sessionId}`;
  const addSession = (coach: Agent) =>
    fromTemplate(coach, { title: "Séance de trop", scheduledDate: world.monday }).then((body) =>
      coach.post(`/plan-weeks/${world.planTi.weekId}/sessions`).send(body),
    );
  const send = (agent: Agent, content: string) =>
    agent.post(`/conversations/${threadId}/messages`).send({ type: MessageType.TEXT, content });
  const threadOf = async (agent: Agent) =>
    ((await agent.get("/conversations")).body as ConversationDto[]).find(
      (thread) => thread.id === threadId,
    );
  const sheetPath = () => `/athletes/${world.ids.ti}/sheet`;
  const overdueOf = async (coach: Agent) =>
    ((await coach.get("/reminders")).body as ReminderDto[]).filter(
      (reminder) => reminder.entityId === invoiceId,
    );

  beforeAll(async () => {
    world = await sharedPlanWorld("relation-end");
    await grantPlan(world, world.planTi.id, "WRITE");
    expect((await billAndPublish(world.c, world.planTi.id)).status).toBe(200);
    invoiceId = required(
      ((await world.c.get("/invoices")).body as { id: string; planId: string | null }[]).find(
        (invoice) => invoice.planId === world.planTi.id,
      )?.id,
      "facture du cycle de TI",
    );

    expect(
      (await world.ti.put(`${sessionPath()}/feedback`).send({ content: "Faite" })).status,
    ).toBe(200);
    const thread = await openWith(world.c, world.ids.ti, "athlete");
    threadId = thread.body.id;
    expect((await send(world.c, "Bien joué")).status).toBe(201);
    const sheet = await world.c
      .put(sheetPath())
      .send({ content: "Objectif 8a", expectedUpdatedAt: null });
    expect(sheet.status).toBe(200);

    const image = { type: "IMAGE", fileName: "voie.jpg", mimeType: "image/jpeg", size: 2_000 };
    debriefUpload = (await world.ti.post(`${sessionPath()}/feedback/media/upload-url`).send(image))
      .body.storagePath;
    messageUpload = (
      await world.ti.post(`/conversations/${threadId}/messages/upload-url`).send(image)
    ).body.storagePath;

    // La facture est échue (2026-01-05) : le tick d'avant la rupture la relance.
    expect((await tick()).status).toBe(200);
    expect(await overdueOf(world.c)).toEqual([
      expect.objectContaining({ status: ReminderStatus.PENDING }),
    ]);

    const res = await world.c.post(`/athletes/${world.ids.ti}/end`);
    expect(res.status).toBe(200);
    ended = res.body;
  });

  it("C met fin au suivi : le lien passe à ENDED, daté, et TI en est prévenue", async () => {
    expect(ended).toMatchObject({
      coachId: world.ids.c,
      athleteId: world.ids.ti,
      status: CoachAthleteStatus.ENDED,
      endedAt: expect.any(String),
    });
    expect(await noticesOf(world.ti, "RELATION_ENDED_BY_COACH")).toEqual([
      expect.objectContaining({ entityType: "COACH_ATHLETE", entityId: ended.id }),
    ]);
    // Les deux listes le gardent : c'est par lui qu'on relit l'archive.
    const athletes = (await world.c.get("/athletes")).body as CoachAthleteDto[];
    expect(athletes.find((relation) => relation.id === ended.id)?.status).toBe(
      CoachAthleteStatus.ENDED,
    );
    const coaches = (await world.ti.get("/me/coaches")).body as CoachAthleteDto[];
    expect(coaches.find((relation) => relation.id === ended.id)?.endedAt).toBe(ended.endedAt);
  });

  it("rompre de nouveau ne redate rien et ne reprévient personne", async () => {
    const again = await world.c.post(`/athletes/${world.ids.ti}/end`);
    expect(again.status).toBe(200);
    expect(again.body.endedAt).toBe(ended.endedAt);
    expect(await noticesOf(world.ti, "RELATION_ENDED_BY_COACH")).toHaveLength(1);
  });

  it("on ne rompt qu'un lien à soi : 404 sinon, sans rien dire de celui des autres", async () => {
    expect((await world.n.post(`/athletes/${world.ids.ti}/end`)).status).toBe(404);
    expect((await world.c.post(`/athletes/${world.ids.b}/end`)).status).toBe(404);
    expect((await world.ti.post(`/me/coaches/${world.ids.n}/leave`)).status).toBe(404);
    // Chacun à son titre : un athlète ne rompt pas par la route du Coach, ni l'inverse.
    expect((await world.ti.post(`/athletes/${world.ids.c}/end`)).status).toBe(403);
    expect((await world.c.post(`/me/coaches/${world.ids.m}/leave`)).status).toBe(403);
  });

  it("C relit le cycle de TI, et n'y écrit plus", async () => {
    const plan = await world.c.get(`/plans/${world.planTi.id}`);
    expect(plan.status).toBe(200);
    expect(plan.body.followEndedAt).toBe(ended.endedAt);

    expectFollowEnded(await addSession(world.c));
    expectFollowEnded(
      await patchAtLatest(world.c, `/plans/${world.planTi.id}`, { title: "Renommé" }),
    );
  });

  it("M, qui suit encore TI et avait l'Écriture, n'y écrit plus non plus", async () => {
    expect((await world.m.get(`/plans/${world.planTi.id}`)).status).toBe(200);
    expectFollowEnded(await addSession(world.m));
  });

  it("C ne prépare plus de cycle pour TI", async () => {
    const created = await world.c.post("/plans").send({
      athleteId: world.ids.ti,
      title: "Après la rupture",
      startDate: world.monday,
      weeks: [{ type: "TRAINING" }],
    });
    expectFollowEnded(created);
  });

  it("le tick écarte la relance de la facture d'un athlète parti, et n'en crée plus", async () => {
    expect((await tick()).status).toBe(200);
    expect(await overdueOf(world.c)).toEqual([
      expect.objectContaining({ status: ReminderStatus.DISMISSED }),
    ]);
  });

  it("la facture déjà émise se règle encore ; ses termes ne se réécrivent plus", async () => {
    expectFollowEnded(
      await world.c
        .put(`/plans/${world.planTi.id}/billing`)
        .send({ amountCents: 1, dueDate: "2026-01-05" }),
    );
    const paid = await world.c
      .patch(`/invoices/${invoiceId}/status`)
      .send({ status: InvoiceStatus.PAID });
    expect(paid.status).toBe(200);
  });

  it("TI relit sa séance et son débrief, et ne débriefe plus", async () => {
    const session = await world.ti.get(sessionPath());
    expect(session.status).toBe(200);
    expect(session.body.followEndedAt).toBe(ended.endedAt);
    expect((await world.ti.get(`${sessionPath()}/feedback`)).body.content).toBe("Faite");

    expectFollowEnded(await world.ti.put(`${sessionPath()}/feedback`).send({ content: "Encore" }));
    // Un envoi découpé commencé avant ne se recolle plus : l'objet resterait sans débrief.
    expectFollowEnded(
      await world.ti
        .post(`${sessionPath()}/feedback/media/upload/complete`)
        .send({ storagePath: debriefUpload, uploadId: "envoi-d-avant", partCount: 1 }),
    );
    expectFollowEnded(
      await world.ti
        .post(`${sessionPath()}/feedback/media/upload-url`)
        .send({ type: "IMAGE", fileName: "voie.jpg", mimeType: "image/jpeg", size: 2_000 }),
    );
  });

  it("le fil direct se relit, et ne s'écrit plus — d'un côté comme de l'autre", async () => {
    // Les apps ouvrent un fil par « créer ou rendre » : le lien rompu ne les en empêche pas.
    for (const reopened of [
      await openWith(world.c, world.ids.ti, "athlete"),
      await openWith(world.ti, world.ids.c, "coach"),
    ]) {
      expect(reopened.body).toMatchObject({ id: threadId, followEndedAt: ended.endedAt });
    }
    for (const agent of [world.c, world.ti]) {
      expect((await threadOf(agent))?.followEndedAt).toBe(ended.endedAt);
      expect((await agent.get(`/conversations/${threadId}/messages`)).body).toHaveLength(2);
      expectFollowEnded(await send(agent, "Encore là ?"));
      expectFollowEnded(
        await agent
          .post(`/conversations/${threadId}/messages/upload/complete`)
          .send({ storagePath: messageUpload, uploadId: "envoi-d-avant", partCount: 1 }),
      );
      // Marquer lu n'écrit rien du couple : ça reste permis.
      expect((await agent.post(`/conversations/${threadId}/read`)).status).toBeLessThan(300);
    }
    // Le fil de TI avec M, dont le lien tient, reste ouvert.
    const withM = await openWith(world.m, world.ids.ti, "athlete");
    expect(withM.body.followEndedAt).toBeNull();
  });

  it("la fiche de TI se relit, et ne s'écrit plus", async () => {
    const sheet = await world.c.get(sheetPath());
    expect(sheet.status).toBe(200);
    expect(sheet.body.content).toBe("Objectif 8a");
    expectFollowEnded(
      await world.c
        .put(sheetPath())
        .send({ content: "Objectif 8b", expectedUpdatedAt: sheet.body.updatedAt }),
    );
  });

  it("C réinvite TI : le lien reprend, et tout se rouvre", async () => {
    const invitation = await inviteFor(world.c, world.ti);
    const accepted = await world.ti.post(`/invitations/${invitation.body.id}/accept`);
    expect(accepted.status).toBe(201);
    expect(accepted.body).toEqual([
      expect.objectContaining({
        id: ended.id,
        status: CoachAthleteStatus.ACTIVE,
        endedAt: null,
        organizationName: null,
      }),
    ]);

    expect((await world.c.get(`/plans/${world.planTi.id}`)).body.followEndedAt).toBeNull();
    expect((await addSession(world.c)).status).toBe(201);
    expect((await addSession(world.m)).status).toBe(201);
    expect(
      (await world.ti.put(`${sessionPath()}/feedback`).send({ content: "Reprise" })).status,
    ).toBe(200);
    expect((await send(world.ti, "Me revoilà")).status).toBe(201);
    expect((await threadOf(world.c))?.followEndedAt).toBeNull();
  });

  /**
   * L'autre sens : TI quitte M. M lisait le cycle de C par le droit de F, qui suppose son PROPRE
   * lien avec TI — il ne le lit plus. Le cycle de C, lui, reste ouvert : son lien tient.
   */
  it("TI quitte M : M en est prévenu, et ne lit plus le cycle de C", async () => {
    const left = await world.ti.post(`/me/coaches/${world.ids.m}/leave`);
    expect(left.status).toBe(200);
    expect(left.body.status).toBe(CoachAthleteStatus.ENDED);
    expect(await noticesOf(world.m, "RELATION_ENDED_BY_ATHLETE")).toEqual([
      expect.objectContaining({ entityId: left.body.id }),
    ]);

    expect((await world.m.get(`/plans/${world.planTi.id}`)).status).toBe(404);
    expect((await addSession(world.c)).status).toBe(201);
  });
});

/**
 * Ce qu'un lien rompu ne retient plus, et ce qu'une entreprise ne rouvre pas. Comptes
 * `relation-end-solo-` et `relation-end-org-`.
 */
describe("Rupture d'un lien : ce qu'elle libère, et ce qui ne la défait pas", () => {
  // Un couple sans lien ne devrait pas exister ; s'il en reste un, son fil reste ouvert, et le
  // service comme le scope le disent — sinon il s'annonce ouvert et chaque envoi tombe en 500.
  it("le fil direct d'un couple sans lien reste ouvert, et s'annonce comme tel", async () => {
    const coach = await signUp("relation-end-unlinked-c@cmv.test", Role.COACH);
    const athlete = await signUp("relation-end-unlinked-a@cmv.test", Role.ATHLETE);
    const athleteId = await link(coach, athlete);
    const thread = await openWith(coach, athleteId, "athlete");
    await app.get(PrismaService).coachAthlete.deleteMany({ where: { athleteId } });

    const listed = (await coach.get("/conversations")).body as ConversationDto[];
    expect(
      listed.find((conversation) => conversation.id === thread.body.id)?.followEndedAt,
    ).toBeNull();
    const sent = await coach
      .post(`/conversations/${thread.body.id}/messages`)
      .send({ type: MessageType.TEXT, content: "Toujours là" });
    expect(sent.status).toBe(201);
  });

  it("l'athlète qui a quitté son seul Coach peut renoncer à la capacité athlète", async () => {
    const coach = await signUp("relation-end-solo-c@cmv.test", Role.COACH);
    const solo = await signUp("relation-end-solo-a@cmv.test", Role.ATHLETE);
    await link(coach, solo);
    const coachOnly = { isCoach: true, isAthlete: false };

    // Lié, il est retenu : c'est ce que la rupture vient défaire.
    expect((await solo.patch("/me/capabilities").send(coachOnly)).status).toBe(409);
    expect((await solo.post(`/me/coaches/${await idOf(coach)}/leave`)).status).toBe(200);
    expect((await solo.patch("/me/capabilities").send(coachOnly)).status).toBe(200);
  });

  it("le brouillon d'un couple rompu se supprime encore, sans se réaffecter", async () => {
    const world = await sharedPlanWorld("relation-end-draft");
    expect((await world.te.post(`/me/coaches/${world.ids.c}/leave`)).status).toBe(200);

    expectFollowEnded(
      await patchAtLatest(world.c, `/plans/${world.planTe.id}`, { athleteId: null }),
    );
    expect((await deleteAtLatest(world.c, `/plans/${world.planTe.id}`)).status).toBe(204);
  });

  it("la rupture retire l'invitation d'avant, qui ne la défait plus ; une nouvelle, si", async () => {
    const world = await sharedPlanWorld("relation-end-stale");
    const stale = await inviteFor(world.c, world.te);
    expect(stale.status).toBe(201);
    expect((await world.te.post(`/me/coaches/${world.ids.c}/leave`)).status).toBe(200);

    // Retirée par la rupture : elle quitte « Mes invitations », et ne s'accepte plus.
    const pending = (await world.te.get("/invitations/for-me")).body as { id: string }[];
    expect(pending.map((invitation) => invitation.id)).not.toContain(stale.body.id);
    const refused = await world.te.post(`/invitations/${stale.body.id}/accept`);
    expect(refused.status).toBe(410);
    expectFollowEnded(
      await patchAtLatest(world.c, `/plans/${world.planTe.id}`, { title: "Toujours fermé" }),
    );

    const fresh = await inviteFor(world.c, world.te);
    const accepted = await world.te.post(`/invitations/${fresh.body.id}/accept`);
    expect(accepted.status).toBe(201);
    expect(accepted.body[0].status).toBe(CoachAthleteStatus.ACTIVE);
  });

  it("l'invitation d'une entreprise ne rouvre pas le lien qu'un athlète a rompu", async () => {
    const world = await sharedPlanWorld("relation-end-org");
    expect((await world.te.post(`/me/coaches/${world.ids.c}/leave`)).status).toBe(200);

    const invited = await world.company
      .post("/organization/invitations")
      .send({ email: await emailOf(world.te), role: InvitationRole.ATHLETE });
    expect(invited.status).toBe(201);
    const joined = await world.te.post(`/invitations/${invited.body.id}/accept`);
    expect(joined.status).toBe(201);

    const statusOf = (coachId: string) =>
      (joined.body as CoachAthleteDto[]).find((relation) => relation.coachId === coachId)?.status;
    expect(statusOf(world.ids.c)).toBe(CoachAthleteStatus.ENDED);
    expect(statusOf(world.ids.m)).toBe(CoachAthleteStatus.ACTIVE);
    expectFollowEnded(
      await patchAtLatest(world.c, `/plans/${world.planTe.id}`, { title: "Toujours fermé" }),
    );
  });
});
