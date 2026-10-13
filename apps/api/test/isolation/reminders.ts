import { Role, shiftIsoDate } from "@cmv/shared";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { startOfProductDay, toDbDate } from "../../src/util/date.util";
import { type Agent, billAndPublish, inviteFor, required, signUp } from "../support/actors";
import { app, baseURL } from "../support/app";
import { inFuture, inPast, mondayOfCurrentWeek } from "../support/fixtures";
import { deleteAtLatest, publishAtLatest } from "../support/version";

describe("Rappels du coach (#44)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let a1Id: string;
  let planId: string;
  let invoiceId: string;

  const monday = mondayOfCurrentWeek();

  type Rmd = {
    id: string;
    entityType: string;
    entityId: string;
    targetLabel: string | null;
    dueAt: string;
    note: string;
    status: string;
    readAt: string | null;
    updatedAt: string;
  };

  const reminders = async (agent: Agent): Promise<Rmd[]> => (await agent.get("/reminders")).body;
  const summary = async (agent: Agent) => (await agent.get("/reminders/summary")).body;

  beforeAll(async () => {
    coachA = await signUp("rmd-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("rmd-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("rmd-athlete-a1@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coachA, athleteA1);
    const accepted = await athleteA1.post(`/invitations/${invitation.body.id}/accept`);
    a1Id = accepted.body[0].athleteId;

    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle à renouveler",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;
    // Diffusé pour disposer d'une facture ÉMISE, l'autre cible offerte par l'UI.
    expect((await billAndPublish(coachA, planId)).status).toBe(200);
    invoiceId = (await coachA.get("/invoices")).body[0].id;
  });

  it("crée un rappel sur un cycle : la cible est nommée, le rappel est à traiter", async () => {
    const res = await coachA.post("/reminders").send({
      entityType: "PLAN",
      entityId: planId,
      dueAt: inFuture(24),
      note: "Relancer le renouvellement",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      entityType: "PLAN",
      entityId: planId,
      // Libellé BRUT (le titre du cycle) : le client compose et traduit.
      targetLabel: "Cycle à renouveler",
      note: "Relancer le renouvellement",
      status: "PENDING",
      readAt: null,
    });
  });

  it("crée un rappel sur une facture : la cible est nommée par sa période", async () => {
    const res = await coachA.post("/reminders").send({
      entityType: "INVOICE",
      entityId: invoiceId,
      dueAt: inPast(2),
      note: "Facture impayée",
    });

    expect(res.status).toBe(201);
    expect(res.body.entityType).toBe("INVOICE");
    // La période du mois facturé, dérivée du cycle — pas un libellé rendu côté API.
    expect(res.body.targetLabel).toBe(monday.slice(0, 7));
  });

  /**
   * Deux rappels à traiter, dont UN seul est dû (l'autre échoit dans 24 h). Les deux compteurs
   * s'emboîtent — ils ne se complètent pas : les afficher côte à côte montrerait deux fois le même
   * rappel en retard. C'est pourquoi le dashboard n'expose que `dueCount`.
   */
  it("le résumé compte les rappels dus, sous-ensemble des rappels à traiter", async () => {
    expect(await summary(coachA)).toEqual({ dueCount: 1, pendingCount: 2 });
  });

  /**
   * LE test qui protège la décision de #111 : `readAt` (« vu dans le centre ») n'est pas le statut
   * (« traité »). Le badge de la cloche, lui, ne compte que les dus NON LUS — si `dueCount` faisait
   * pareil, dérouler ses notifications viderait la tuile « à traiter » sans qu'un seul rappel n'ait
   * été traité.
   */
  it("un rappel dû et VU reste compté : readAt ne vaut pas traité", async () => {
    const due = (await reminders(coachA)).find((r) => r.note === "Facture impayée");
    expect(due).toBeDefined();

    // Marquage par le centre de notifications, où le rappel dû figure sous un id préfixé.
    const read = await coachA.patch(`/me/notifications/reminder:${due?.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.readAt).not.toBeNull();

    expect(await summary(coachA)).toEqual({ dueCount: 1, pendingCount: 2 });
  });

  /**
   * Le contrôle qui compte : `entityId` n'a pas de clé étrangère, et une FK n'imposerait de toute
   * façon pas le tenant. Sans lui, un coach posait un rappel sur le cycle d'un autre — et en lisait
   * le titre dans `targetLabel`. Le 400 ne distingue pas « absente » de « à quelqu'un d'autre ».
   */
  it("refuse une cible qui n'est pas au coach courant (400)", async () => {
    // Une cible EXISTANTE, mais appartenant à un autre coach : c'est le cas qui compte. Sans le
    // contrôle, coachB posait un rappel sur la facture de coachA et en lisait la période.
    const stolenPlan = await coachB
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: planId, dueAt: inFuture(1), note: "x" });
    expect(stolenPlan.status).toBe(400);

    const stolenInvoice = await coachB
      .post("/reminders")
      .send({ entityType: "INVOICE", entityId: invoiceId, dueAt: inFuture(1), note: "x" });
    expect(stolenInvoice.status).toBe(400);

    // Et une cible qui n'existe nulle part : même refus, même message — dire à un coach qu'un id
    // existe ailleurs serait déjà une fuite.
    const unknown = await coachA
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: "pln_inexistant", dueAt: inFuture(1), note: "x" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toBe(stolenPlan.body.message);
  });

  it("le schéma partagé rejette une note vide, une échéance sans heure, un tenant transmis", async () => {
    const base = { entityType: "PLAN", entityId: planId, dueAt: inFuture(1) };
    expect((await coachA.post("/reminders").send({ ...base, note: "" })).status).toBe(400);
    // `dueAt` est un INSTANT : une date civile ne laisserait pas l'API choisir un fuseau.
    expect(
      (await coachA.post("/reminders").send({ ...base, dueAt: monday, note: "x" })).status,
    ).toBe(400);
    // .strict() : le tenant est injecté, jamais transmis.
    expect(
      (await coachA.post("/reminders").send({ ...base, note: "x", coachId: a1Id })).status,
    ).toBe(400);
  });

  /**
   * Un rappel est un outil PRIVÉ du coach : `Reminder` n'a aucun scope athlète. Le 403 vient du
   * `@Roles` du contrôleur — sans lui, la requête atteindrait l'extension Prisma, qui refuse par une
   * ERREUR, et l'athlète recevrait un 500.
   */
  it("l'athlète n'a aucun accès aux rappels (403, jamais 500)", async () => {
    expect((await athleteA1.get("/reminders")).status).toBe(403);
    // Le résumé est sous le même `@Roles` de classe : un athlète ne doit pas plus compter les
    // rappels que les lire. Sans la garde, l'extension Prisma lèverait — un 500, pas un 403.
    expect((await athleteA1.get("/reminders/summary")).status).toBe(403);
    expect(
      (
        await athleteA1
          .post("/reminders")
          .send({ entityType: "PLAN", entityId: planId, dueAt: inFuture(1), note: "x" })
      ).status,
    ).toBe(403);
    const mine = required((await reminders(coachA))[0], "rappel du coach A");
    expect(
      (await athleteA1.patch(`/reminders/${mine.id}/status`).send({ status: "DONE" })).status,
    ).toBe(403);
  });

  /**
   * L'ordre est imposé par l'API pour que le client segmente sans retrier : à traiter d'abord, le
   * plus en retard en tête. Et les deux segments sont bornés SÉPARÉMENT — sur une seule liste bornée,
   * une pile de rappels traités pousserait les rappels à traiter hors de la borne.
   */
  it("liste les rappels à traiter d'abord, le plus en retard en tête", async () => {
    const list = await reminders(coachA);
    expect(list.every((r) => r.status === "PENDING")).toBe(true);
    expect(required(list[0], "rappel en tête").note).toBe("Facture impayée"); // dû il y a 2 h
    expect(required(list[1], "2e rappel").note).toBe("Relancer le renouvellement"); // dû dans 24 h
  });

  it("marque fait, puis rouvre : le toggle est réversible dans les deux sens", async () => {
    const target = required((await reminders(coachA))[0], "rappel à basculer");

    const done = await coachA.patch(`/reminders/${target.id}/status`).send({ status: "DONE" });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("DONE");

    const reopened = await coachA
      .patch(`/reminders/${target.id}/status`)
      .send({ status: "PENDING" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("PENDING");
  });

  // Sans idempotence, un rappel traité remonterait en tête de l'historique à chaque clic répété.
  it("remarquer le même statut ne redate pas le rappel", async () => {
    const target = required((await reminders(coachA))[0], "rappel à re-marquer");
    const first = await coachA
      .patch(`/reminders/${target.id}/status`)
      .send({ status: "DISMISSED" });
    const again = await coachA
      .patch(`/reminders/${target.id}/status`)
      .send({ status: "DISMISSED" });

    expect(again.body.updatedAt).toBe(first.body.updatedAt);
  });

  /**
   * Le rappel en retard vient d'être abandonné : il sort des DEUX compteurs. Reste celui qui échoit
   * dans 24 h — à traiter, mais pas encore dû. C'est ce qui distingue les deux nombres.
   */
  it("un rappel traité sort des deux compteurs", async () => {
    expect(await summary(coachA)).toEqual({ dueCount: 0, pendingCount: 1 });
  });

  it("refuse un statut inconnu (400)", async () => {
    const target = required((await reminders(coachA))[0], "rappel au statut inconnu");
    expect(
      (await coachA.patch(`/reminders/${target.id}/status`).send({ status: "SNOOZED" })).status,
    ).toBe(400);
  });

  it("isolation : un autre coach ne voit ni ne marque le rappel (404)", async () => {
    const mine = required((await reminders(coachA))[0], "rappel du coach A");
    expect(await reminders(coachB)).toHaveLength(0);
    // Le résumé est scopé comme la liste : compter n'est pas un contournement de la lecture.
    expect(await summary(coachB)).toEqual({ dueCount: 0, pendingCount: 0 });
    expect(
      (await coachB.patch(`/reminders/${mine.id}/status`).send({ status: "DONE" })).status,
    ).toBe(404);
  });

  /**
   * Le point où le raisonnement de la dette N-4 ne suffit pas : contrairement à une notification, un
   * rappel a un vrai chemin vers la cible disparue — un cycle DRAFT se supprime. La facture DRAFT du
   * cycle part en cascade, donc son rappel aussi.
   */
  it("supprimer un cycle purge les rappels qui le visaient, lui et sa facture", async () => {
    const draft = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle éphémère",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const draftPlanId = draft.body.id;
    await coachA
      .put(`/plans/${draftPlanId}/billing`)
      .send({ amountCents: 4000, dueDate: "2026-02-05" });
    const draftInvoiceId = (await coachA.get(`/plans/${draftPlanId}/billing`)).body.id;

    for (const target of [
      { entityType: "PLAN", entityId: draftPlanId },
      { entityType: "INVOICE", entityId: draftInvoiceId },
    ]) {
      expect(
        (await coachA.post("/reminders").send({ ...target, dueAt: inFuture(6), note: "à purger" }))
          .status,
      ).toBe(201);
    }
    expect((await reminders(coachA)).filter((r) => r.note === "à purger")).toHaveLength(2);

    expect((await deleteAtLatest(coachA, `/plans/${draftPlanId}`)).status).toBe(204);
    expect((await reminders(coachA)).filter((r) => r.note === "à purger")).toHaveLength(0);
  });
});

describe("Rappels dus dans le centre de notifications (#51)", () => {
  let coachC: Agent;
  let coachD: Agent;
  let athleteC1: Agent;
  let c1Id: string;
  let planId: string;
  let sessionId: string;
  let dueId: string;
  let upcomingId: string;

  const monday = mondayOfCurrentWeek();

  type Entry = {
    id: string;
    type: string;
    entityType: string;
    entityId: string;
    actorName: string | null;
    subjectLabel: string | null;
    readAt: string | null;
    createdAt: string;
  };

  const inbox = async (agent: Agent): Promise<Entry[]> =>
    (await agent.get("/me/notifications")).body;
  const unread = async (agent: Agent): Promise<number> =>
    (await agent.get("/me/notifications/unread-count")).body.count;
  const reminderOf = async (agent: Agent, id: string) =>
    ((await agent.get("/reminders")).body as { id: string; dueAt: string }[]).find(
      (r) => r.id === id,
    );

  const DUE_NOTE = "Relancer le renouvellement du cycle";

  beforeAll(async () => {
    coachC = await signUp("due-coach-c@cmv.test", Role.COACH);
    coachD = await signUp("due-coach-d@cmv.test", Role.COACH);
    athleteC1 = await signUp("due-athlete-c1@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coachC, athleteC1);
    const accepted = await athleteC1.post(`/invitations/${invitation.body.id}/accept`);
    c1Id = accepted.body[0].athleteId;

    const plan = await coachC.post("/plans").send({
      athleteId: c1Id,
      title: "Cycle du centre",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;
    const session = await coachC
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: "Séance du centre", scheduledDate: monday });
    sessionId = session.body.id;
    await billAndPublish(coachC, planId);

    // Une VRAIE notification persistée chez le coach, pour vérifier que les deux sources se mêlent.
    await athleteC1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Séance faite" });

    const due = await coachC
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: planId, dueAt: inPast(1), note: DUE_NOTE });
    dueId = due.body.id;
    const upcoming = await coachC
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: planId, dueAt: inFuture(48), note: "Pas encore dû" });
    upcomingId = upcoming.body.id;
  });

  /**
   * L'entrée est CALCULÉE : aucune ligne `notification` n'existe pour elle (`REMINDER_DUE` n'est même
   * pas dans l'enum Prisma). Son id est préfixé, et son libellé n'est pas stocké — seul le paramètre
   * d'interpolation voyage, comme pour tout le centre.
   */
  it("un rappel dû remonte dans le centre du coach, à côté de ses notifications", async () => {
    const list = await inbox(coachC);
    expect(list.map((e) => e.type)).toContain("FEEDBACK_RECEIVED");

    const entry = list.find((e) => e.type === "REMINDER_DUE");
    expect(entry).toMatchObject({
      id: `reminder:${dueId}`,
      // La cible du rappel, pas un écran « rappels » : le routage des deux clients marche déjà.
      entityType: "PLAN",
      entityId: planId,
      actorName: null, // un rappel n'a pas d'acteur : le coach se le rappelle à lui-même
      subjectLabel: DUE_NOTE,
      readAt: null,
    });
  });

  // Le tri du centre se fait sur `createdAt`, et pour un rappel `createdAt` EST son échéance : il se
  // range au moment où il commence à compter, pas à celui où il a été saisi.
  it("l'entrée est datée de l'échéance du rappel, pas de sa création", async () => {
    const entry = required(
      (await inbox(coachC)).find((e) => e.type === "REMINDER_DUE"),
      "entrée REMINDER_DUE",
    );
    const reminder = required(await reminderOf(coachC, dueId), "rappel dû");
    expect(entry.createdAt).toBe(reminder.dueAt);
  });

  it("un rappel encore à venir ne remonte pas", async () => {
    const entries = (await inbox(coachC)).filter((e) => e.type === "REMINDER_DUE");
    expect(entries).toHaveLength(1);
    expect(required(entries[0], "entrée REMINDER_DUE").id).toBe(`reminder:${dueId}`);
  });

  it("le compteur additionne les notifications non lues et les rappels dus non lus", async () => {
    const list = await inbox(coachC);
    expect(await unread(coachC)).toBe(list.filter((e) => e.readAt == null).length);
  });

  /**
   * Marquer « lu » un rappel dû le sort du badge SANS le traiter : `readAt` dit « vu dans le centre »,
   * `status` dit « traité ». Sans cette distinction, jeter un œil au centre vaudrait « fait ».
   */
  it("marquer un rappel dû comme lu vide son badge sans le traiter", async () => {
    const before = await unread(coachC);

    const res = await coachC.patch(`/me/notifications/reminder:${dueId}/read`);
    expect(res.status).toBe(200);
    expect(res.body.readAt).not.toBeNull();
    expect(await unread(coachC)).toBe(before - 1);

    // Le rappel reste à traiter, et reste dans le centre.
    expect(await reminderOf(coachC, dueId)).toMatchObject({ status: "PENDING" });
    expect((await inbox(coachC)).some((e) => e.id === `reminder:${dueId}`)).toBe(true);
  });

  it("relire un rappel déjà lu ne le redate pas", async () => {
    const first = (await inbox(coachC)).find((e) => e.id === `reminder:${dueId}`);
    const again = await coachC.patch(`/me/notifications/reminder:${dueId}/read`);
    expect(again.body.readAt).toBe(first?.readAt);
  });

  /**
   * Le piège le moins visible du lot : « tout marquer comme lu » ne doit toucher que les rappels
   * DUS. Marquer un rappel à venir éteindrait son badge par avance — le jour de son échéance, il
   * n'annoncerait plus rien.
   */
  it("« tout marquer comme lu » épargne les rappels encore à venir", async () => {
    expect((await coachC.post("/me/notifications/read-all")).status).toBe(204);
    expect(await unread(coachC)).toBe(0);

    expect(await reminderOf(coachC, upcomingId)).toMatchObject({ readAt: null });
  });

  it("traiter un rappel le retire du centre", async () => {
    expect((await coachC.patch(`/reminders/${dueId}/status`).send({ status: "DONE" })).status).toBe(
      200,
    );
    expect((await inbox(coachC)).some((e) => e.type === "REMINDER_DUE")).toBe(false);
  });

  /**
   * Non-régression du piège n°1 : `Reminder` n'a aucun scope athlète, donc lire la table pour un
   * athlète LÈVE au lieu de rendre une liste vide. Sans le branchement par rôle du feed, ces deux
   * requêtes seraient des 500 — sur un écran qui ne parle même pas de rappels.
   */
  it("le centre d'un athlète reste servi (200) et ignore les rappels", async () => {
    const res = await athleteC1.get("/me/notifications");
    expect(res.status).toBe(200);
    expect((res.body as Entry[]).some((e) => e.type === "REMINDER_DUE")).toBe(false);

    const count = await athleteC1.get("/me/notifications/unread-count");
    expect(count.status).toBe(200);
  });

  it("un athlète qui marque un id de rappel obtient un 404, pas un 500", async () => {
    expect((await athleteC1.patch(`/me/notifications/reminder:${dueId}/read`)).status).toBe(404);
  });

  it("isolation : le rappel dû d'un coach n'entre pas dans le centre d'un autre", async () => {
    expect(await inbox(coachD)).toHaveLength(0);
    expect(await unread(coachD)).toBe(0);
    expect((await coachD.patch(`/me/notifications/reminder:${upcomingId}/read`)).status).toBe(404);
  });
});

/**
 * Report d'échéance d'un rappel (#105) — dette R-3.
 *
 * L'enjeu de ce bloc n'est pas la route, c'est le sort de `readAt`. Un rappel dû, VU dans le centre,
 * puis repoussé à la semaine prochaine : s'il revient « déjà lu », son badge ne s'allume jamais le
 * jour où il compte. `readAt` dit « vu à CETTE échéance-là » — il est donc remis à `null` dès que
 * l'échéance bouge, et seulement alors.
 *
 * C'est la même règle que celle appliquée par l'autre bout dans « tout marquer comme lu », qui
 * épargne les rappels encore à venir pour ne pas éteindre leur badge par avance.
 */
describe("Report d'échéance d'un rappel (#105)", () => {
  let coachE: Agent;
  let coachF: Agent;
  let athleteE1: Agent;
  let planId: string;
  let reminderId: string;

  const monday = mondayOfCurrentWeek();

  type Rmd = {
    id: string;
    dueAt: string;
    note: string;
    status: string;
    readAt: string | null;
    updatedAt: string;
  };

  const reminderOf = async (agent: Agent, id: string): Promise<Rmd | undefined> =>
    ((await agent.get("/reminders")).body as Rmd[]).find((r) => r.id === id);
  const inboxIds = async (agent: Agent): Promise<string[]> =>
    ((await agent.get("/me/notifications")).body as { id: string }[]).map((e) => e.id);
  const unread = async (agent: Agent): Promise<number> =>
    (await agent.get("/me/notifications/unread-count")).body.count;

  beforeAll(async () => {
    coachE = await signUp("snz-coach-e@cmv.test", Role.COACH);
    coachF = await signUp("snz-coach-f@cmv.test", Role.COACH);
    athleteE1 = await signUp("snz-athlete-e1@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coachE, athleteE1);
    const accepted = await athleteE1.post(`/invitations/${invitation.body.id}/accept`);

    const plan = await coachE.post("/plans").send({
      athleteId: accepted.body[0].athleteId,
      title: "Cycle à repousser",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;

    // Dû depuis 2 h : il est donc DANS le centre, et non lu.
    const created = await coachE
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: planId, dueAt: inPast(2), note: "Relancer" });
    reminderId = created.body.id;
  });

  it("le rappel dû est bien dans le centre, non lu, avant tout report", async () => {
    expect(await inboxIds(coachE)).toContain(`reminder:${reminderId}`);
    expect(await reminderOf(coachE, reminderId)).toMatchObject({ readAt: null });
  });

  /**
   * LE test de cette issue. Le rappel est d'abord VU dans le centre (`readAt` posé), puis repoussé :
   * il en sort, et son `readAt` est effacé. Sans cet effacement, il reviendrait la semaine prochaine
   * marqué comme lu — silencieux le jour même où il devient utile.
   */
  it("repousser un rappel VU efface son readAt et le sort du centre", async () => {
    expect((await coachE.patch(`/me/notifications/reminder:${reminderId}/read`)).status).toBe(200);
    expect(await reminderOf(coachE, reminderId)).toMatchObject({ readAt: expect.any(String) });

    const res = await coachE.patch(`/reminders/${reminderId}`).send({ dueAt: inFuture(168) });
    expect(res.status).toBe(200);
    expect(res.body.readAt).toBeNull();
    expect(res.body.status).toBe("PENDING"); // repousser ne traite pas

    // Plus dû : il quitte le centre, et cesse d'être compté par le badge.
    expect(await inboxIds(coachE)).not.toContain(`reminder:${reminderId}`);
  });

  /**
   * L'autre moitié de la règle : à sa NOUVELLE échéance, le rappel revient comme une nouveauté. On
   * simule le passage du temps en le repoussant dans le passé — c'est le même chemin de code, et
   * c'est aussi ce qui permet d'avancer volontairement un rappel.
   */
  it("à sa nouvelle échéance, il revient dans le centre comme NON lu", async () => {
    const before = await unread(coachE);

    const res = await coachE.patch(`/reminders/${reminderId}`).send({ dueAt: inPast(1) });
    expect(res.status).toBe(200);
    expect(res.body.readAt).toBeNull();

    expect(await inboxIds(coachE)).toContain(`reminder:${reminderId}`);
    expect(await unread(coachE)).toBe(before + 1);
  });

  /**
   * L'entrée du centre est datée de l'ÉCHÉANCE (#51) : reporter un rappel le déplace donc dans le
   * tri du centre. C'est voulu — un rappel se range au moment où il commence à compter — et ce test
   * fige le fait que le report ne casse pas cet invariant.
   */
  it("l'entrée du centre suit la nouvelle échéance", async () => {
    const reminder = required(await reminderOf(coachE, reminderId), "rappel reporté");
    const entry = (
      (await coachE.get("/me/notifications")).body as { id: string; createdAt: string }[]
    ).find((e) => e.id === `reminder:${reminderId}`);
    expect(required(entry, "entrée du rappel reporté").createdAt).toBe(reminder.dueAt);
  });

  // Corriger la note n'est pas une nouvelle occurrence : le rappel a déjà été vu à cette échéance,
  // le rallumer dans le badge parce qu'on a rectifié une faute de frappe serait du bruit.
  it("corriger la note seule ne touche pas readAt", async () => {
    expect((await coachE.patch(`/me/notifications/reminder:${reminderId}/read`)).status).toBe(200);

    const res = await coachE.patch(`/reminders/${reminderId}`).send({ note: "Relancer lundi" });
    expect(res.status).toBe(200);
    expect(res.body.note).toBe("Relancer lundi");
    expect(res.body.readAt).not.toBeNull();
  });

  /**
   * Idempotence, même raison que pour `updateStatus` : l'historique est trié par `updatedAt`
   * décroissant. Sans ce court-circuit, réenregistrer un formulaire sans rien changer ferait
   * remonter le rappel en tête — et, pire, rallumerait son badge en effaçant `readAt`.
   */
  it("renvoyer les mêmes valeurs ne redate rien et ne rallume pas le badge", async () => {
    const before = required(await reminderOf(coachE, reminderId), "rappel avant no-op");
    const res = await coachE
      .patch(`/reminders/${reminderId}`)
      .send({ dueAt: before.dueAt, note: before.note });

    expect(res.status).toBe(200);
    expect(res.body.updatedAt).toBe(before.updatedAt);
    expect(res.body.readAt).not.toBeNull();
  });

  it("le schéma partagé refuse un corps vide, une échéance sans heure, un statut, un tenant", async () => {
    const patch = (body: object) => coachE.patch(`/reminders/${reminderId}`).send(body);

    // Un corps vide ne demande rien : l'accepter écrirait pour une requête sans intention.
    expect((await patch({})).status).toBe(400);
    expect((await patch({ dueAt: monday })).status).toBe(400);
    expect((await patch({ note: "" })).status).toBe(400);
    // `.strict()` — le statut a SA route, et le tenant est injecté, jamais transmis.
    expect((await patch({ status: "DONE" })).status).toBe(400);
    expect((await patch({ note: "x", coachId: "usr_1" })).status).toBe(400);
    // `readAt` est décidé par l'API : le piloter permettrait d'éteindre son propre badge.
    expect((await patch({ dueAt: inFuture(1), readAt: null })).status).toBe(400);
  });

  /**
   * L'isolation, dans ses deux formes. Un autre coach ne VOIT pas le rappel — le scope ne le lui
   * montre pas, c'est donc un 404 et non un 403 : lui répondre « interdit » confirmerait que cet id
   * existe. Un athlète, lui, prend un 403 du `@Roles` de classe, et surtout PAS le 500 que
   * produirait l'extension Prisma sur un modèle sans scope athlète.
   */
  it("isolation : un autre coach ne peut pas repousser le rappel (404)", async () => {
    const res = await coachF.patch(`/reminders/${reminderId}`).send({ dueAt: inFuture(24) });
    expect(res.status).toBe(404);

    // Et le rappel n'a pas bougé.
    expect(await reminderOf(coachE, reminderId)).toMatchObject({ note: "Relancer lundi" });
  });

  it("l'athlète n'atteint pas la route d'édition (403, jamais 500)", async () => {
    const res = await athleteE1.patch(`/reminders/${reminderId}`).send({ dueAt: inFuture(24) });
    expect(res.status).toBe(403);
  });

  // La route paramétrée ne doit pas avoir avalé `summary`, déclaré au-dessus : c'est la contrainte
  // d'ordre inscrite dans le contrôleur, et elle ne casse que si on réordonne les décorateurs.
  it("l'ajout d'une route paramétrée n'a pas avalé /reminders/summary", async () => {
    const res = await coachE.get("/reminders/summary");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dueCount: expect.any(Number),
      pendingCount: expect.any(Number),
    });
  });
});

/**
 * Génération automatique des rappels et push à l'échéance (#47) — dette R-1.
 *
 * Le tick est appelé **sans session** : c'est un cron externe, pas un utilisateur. Il n'a donc ni
 * acteur courant ni scope tenant — et l'extension Prisma refuse (fail closed) tout modèle sans
 * scope. Ce bloc vérifie que le service ne la contourne pas mais lui **donne un acteur**, coach par
 * coach : ce que génère le tick pour l'un ne doit jamais atterrir chez l'autre.
 *
 * ⚠️ Le tick balaie TOUS les coachs de la base, y compris ceux des blocs précédents. Les assertions
 * portent donc sur ce que voit un coach donné, et sur des DELTAS entre deux ticks — jamais sur un
 * compteur global, qui dépendrait de l'ordre des blocs.
 */
describe("Génération automatique des rappels (#47)", () => {
  // Le secret fixé par `vitest.config.e2e.ts` — une valeur de fixture, pas un environnement.
  const SECRET = "e2e-tick-secret-not-for-production";
  const HEADER = "x-cimavia-tick-secret";

  let coachG: Agent;
  let coachH: Agent;
  let athleteG1: Agent;
  let planId: string;
  let quietPlanId: string;
  let quietInvoiceId: string;

  const monday = mondayOfCurrentWeek();

  type Rmd = {
    id: string;
    entityType: string;
    entityId: string;
    note: string | null;
    reason: string | null;
    status: string;
    dueAt: string;
  };

  // Le tick n'est PAS authentifié : pas d'agent, une requête nue avec l'en-tête.
  const tick = (secret?: string) => {
    const req = request(baseURL).post("/internal/reminders/tick");
    return secret == null ? req : req.set(HEADER, secret);
  };

  const reminders = async (agent: Agent): Promise<Rmd[]> => (await agent.get("/reminders")).body;
  const reasonsOf = async (agent: Agent): Promise<string[]> =>
    (await reminders(agent))
      .map((r) => r.reason)
      .filter((reason): reason is string => reason != null)
      .sort();

  beforeAll(async () => {
    coachG = await signUp("tick-coach-g@cmv.test", Role.COACH);
    coachH = await signUp("tick-coach-h@cmv.test", Role.COACH);
    athleteG1 = await signUp("tick-athlete-g1@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coachG, athleteG1);
    const accepted = await athleteG1.post(`/invitations/${invitation.body.id}/accept`);

    /**
     * Un cycle d'UNE semaine démarrant ce lundi : sa fin tombe dimanche, donc l'échéance du rappel
     * (fin moins sept jours) est déjà passée. `billAndPublish` l'assortit d'une facture à échéance
     * 2026-01-05, largement dépassée — les deux motifs sont donc exerçables d'un seul cycle.
     */
    const plan = await coachG.post("/plans").send({
      athleteId: accepted.body[0].athleteId,
      title: "Cycle qui se termine",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;
    expect((await billAndPublish(coachG, planId)).status).toBe(200);

    /**
     * Le cycle qui ne doit RIEN produire : une facture à échéance lointaine (pas encore en retard),
     * et plus aucune semaine (pas de fin calculable). La diffusion exige une semaine, et l'API ne
     * retire plus celle d'un cycle diffusé (#312) : l'état est celui qu'a pu laisser un retrait
     * d'avant la garde. On le rejoue donc en base — et le tick ne regarde que les cycles diffusés.
     */
    const quiet = await coachG.post("/plans").send({
      athleteId: accepted.body[0].athleteId,
      title: "Cycle vidé de ses semaines",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    quietPlanId = quiet.body.id;
    const billing = await coachG
      .put(`/plans/${quietPlanId}/billing`)
      .send({ amountCents: 5000, dueDate: "2099-01-05" });
    quietInvoiceId = billing.body.id;
    expect((await publishAtLatest(coachG, quietPlanId)).status).toBe(200);
    await app.get(PrismaService).$executeRaw`DELETE FROM plan_week WHERE "planId" = ${quietPlanId}`;
    expect((await coachG.get(`/plans/${quietPlanId}`)).body.weeks).toEqual([]);
  });

  /**
   * La garde, montrée EN ÉCHEC avant tout le reste. Aucune distinction entre « en-tête absent » et
   * « en-tête faux » : dire « il manque un en-tête » à qui n'a pas le secret lui apprendrait le nom
   * du champ à forger.
   *
   * Le fail-closed « secret non configuré → 503 » ne peut pas se jouer ici — l'app e2e est montée
   * une seule fois pour toute la suite — il est couvert par `reminder-tick.guard.test.ts`.
   */
  it("refuse un tick sans secret, avec un mauvais secret, ou via Authorization (401)", async () => {
    expect((await tick()).status).toBe(401);
    expect((await tick("")).status).toBe(401);
    expect((await tick("mauvais-secret")).status).toBe(401);
    expect(
      (
        await request(baseURL)
          .post("/internal/reminders/tick")
          .set("authorization", `Bearer ${SECRET}`)
      ).status,
    ).toBe(401);

    // Et surtout : rien n'a été généré au passage.
    expect(await reminders(coachG)).toHaveLength(0);
  });

  /**
   * La génération des deux cas d'exemple. Le rappel auto-généré n'a **pas de note** : c'est toute la
   * contrainte relevée en construisant #44 — une note écrite par l'API serait un libellé rendu puis
   * persisté, ce que le modèle de notification interdit (#48). Il porte un `reason` à la place.
   */
  it("génère un rappel de fin de cycle et un rappel de facture en retard", async () => {
    const res = await tick(SECRET);
    expect(res.status).toBe(200);
    expect(res.body.scannedCoaches).toBeGreaterThan(0);

    expect(await reasonsOf(coachG)).toEqual(["INVOICE_OVERDUE", "PLAN_ENDING"]);

    const planReminder = required(
      (await reminders(coachG)).find((r) => r.reason === "PLAN_ENDING"),
      "rappel de fin de cycle",
    );
    expect(planReminder).toMatchObject({
      entityType: "PLAN",
      entityId: planId,
      note: null, // l'API ne fabrique JAMAIS de note
      status: "PENDING",
    });
  });

  /**
   * Les deux motifs se DÉRIVENT de la donnée : sans semaine, pas de fin de cycle à annoncer ; avant
   * l'échéance, pas de retard — la liste des rappels contredirait sinon l'écran des factures, qui
   * dit encore « à payer ». Deviner une fin (semaine zéro) ou relancer trop tôt serait un rappel
   * que rien ne justifie.
   */
  it("ne génère rien pour un cycle vidé de ses semaines ni pour une facture pas encore échue", async () => {
    const entities = (await reminders(coachG)).map((r) => r.entityId);

    expect(entities).not.toContain(quietPlanId);
    expect(entities).not.toContain(quietInvoiceId);
  });

  /**
   * L'échéance est dérivée de la DONNÉE, pas de l'heure du tick : la fin du cycle moins sept jours.
   * C'est ce qui rend la granularité du cron externe sans conséquence — un tick en retard d'une
   * heure produit exactement le même rappel.
   */
  it("date le rappel de fin de cycle une semaine avant la fin, pas à l'heure du tick", async () => {
    const planReminder = required(
      (await reminders(coachG)).find((r) => r.reason === "PLAN_ENDING"),
      "rappel de fin de cycle",
    );
    // Cycle d'une semaine depuis lundi → fin le dimanche (lundi + 6), échéance sept jours avant —
    // à minuit À PARIS, pas à minuit UTC (« Tranché en #321 »).
    const dueDay = required(shiftIsoDate(monday, 6 - 7) ?? undefined, "veille du lundi");
    expect(planReminder.dueAt).toBe(startOfProductDay(toDbDate(dueDay)).toISOString());
  });

  /**
   * L'idempotence n'est pas dans le code mais dans l'index unique + `skipDuplicates`. Sans elle, un
   * tick toutes les cinq minutes recréerait les mêmes rappels indéfiniment — c'est LE mode de panne
   * d'un scheduler, et il ne se voit qu'au second passage.
   */
  it("un second tick ne recrée rien et ne repousse rien", async () => {
    const before = await reminders(coachG);
    const res = await tick(SECRET);

    expect(res.body.createdReminders).toBe(0);
    // `pushedAt` est posé au premier tick : la sélection ne voit plus ces rappels.
    expect(res.body.pushedReminders).toBe(0);
    expect(await reminders(coachG)).toHaveLength(before.length);
  });

  /**
   * L'isolation, sur le chemin qui n'a AUCUN acteur courant. `coachH` n'a ni cycle ni facture : il
   * ne doit rien voir. Si le balayage écrivait hors du contexte CLS de chaque coach, ses rappels
   * atterriraient ici ou nulle part — les deux se verraient.
   */
  it("isolation : les rappels générés n'atterrissent que chez leur coach", async () => {
    expect(await reminders(coachH)).toHaveLength(0);
    expect(await coachH.get("/reminders/summary").then((r) => r.body)).toEqual({
      dueCount: 0,
      pendingCount: 0,
    });
  });

  // Le tick reste une route d'API : un athlète ne doit pas plus la déclencher qu'un visiteur. Il n'a
  // pas le secret, donc 401 — et surtout pas un 500 de l'extension Prisma.
  it("l'athlète ne déclenche pas le tick, même connecté (401)", async () => {
    expect((await athleteG1.post("/internal/reminders/tick")).status).toBe(401);
  });

  /**
   * Le rappel généré remonte dans le centre AVEC un sujet transporté comme CLÉ, pas comme libellé
   * rendu. C'est ce qui empêche « le cycle se termine » de partir figé en français dans une charge
   * utile d'API — la faute que `NOTIFICATION_LABEL_KEY` existe pour interdire.
   */
  it("le rappel généré entre dans le centre avec une clé de sujet, pas un libellé", async () => {
    const entries = (await coachG.get("/me/notifications")).body as {
      type: string;
      subjectLabel: string | null;
      subjectKey: string | null;
    }[];

    const entry = required(
      entries.find((e) => e.subjectKey === "reminder.reason.planEnding"),
      "entrée du rappel généré",
    );
    expect(entry.type).toBe("REMINDER_DUE");
    expect(entry.subjectLabel).toBeNull();
  });

  /**
   * Un rappel généré puis TRAITÉ n'est jamais régénéré, même si la condition persiste — la facture
   * reste impayée. C'est la conséquence assumée de l'index unique : le coach a tranché, on ne le
   * relance pas. Sans ce test, quelqu'un « corrigerait » un jour l'index en croyant à un oubli.
   */
  it("ne régénère pas un rappel que le coach a traité", async () => {
    const invoiceReminder = required(
      (await reminders(coachG)).find((r) => r.reason === "INVOICE_OVERDUE"),
      "rappel de facture en retard",
    );
    expect(
      (await coachG.patch(`/reminders/${invoiceReminder.id}/status`).send({ status: "DISMISSED" }))
        .status,
    ).toBe(200);

    const res = await tick(SECRET);
    expect(res.body.createdReminders).toBe(0);

    const after = (await reminders(coachG)).filter((r) => r.reason === "INVOICE_OVERDUE");
    expect(after).toHaveLength(1);
    expect(required(after[0], "rappel traité").status).toBe("DISMISSED");
  });

  /**
   * Le report d'un rappel DÉJÀ poussé (#295). `pushedAt` n'est pas exposé par l'API : seul le
   * compteur du tick le trahit. Chaque test part donc d'une base vidée par un tick préalable — tout
   * ce qui était dû est parti — et lit le delta du tick suivant, comme « un second tick ne recrée
   * rien » plus haut.
   */
  describe("report d'un rappel déjà poussé (#295)", () => {
    let snoozedId: string;
    const pushedBy = async (): Promise<number> => (await tick(SECRET)).body.pushedReminders;

    beforeAll(async () => {
      const created = await coachG
        .post("/reminders")
        .send({ entityType: "PLAN", entityId: planId, dueAt: inPast(2), note: "Relancer" });
      snoozedId = created.body.id;
      await tick(SECRET); // le rappel part : `pushedAt` est posé
    });

    /**
     * LE test de cette issue. Sans la remise à zéro de `pushedAt`, le tick ne voit plus jamais le
     * rappel : le coach l'a repoussé à demain, et demain rien ne part. On simule le passage du temps
     * en le repoussant dans le passé — même chemin de code que « Repousser ».
     */
    it("repart au tick suivant une fois repoussé à une échéance atteinte", async () => {
      expect(await pushedBy()).toBe(0);

      const res = await coachG.patch(`/reminders/${snoozedId}`).send({ dueAt: inPast(1) });
      expect(res.status).toBe(200);

      expect(await pushedBy()).toBe(1);
      expect(await pushedBy()).toBe(0); // et une seule fois : l'idempotence tient toujours
    });

    // Rectifier une faute de frappe n'est pas une nouvelle occurrence — même corollaire que
    // `readAt` (#105) : la note seule ne rallume rien.
    it("ne repart pas quand seule la note change", async () => {
      const res = await coachG.patch(`/reminders/${snoozedId}`).send({ note: "Relancer jeudi" });
      expect(res.status).toBe(200);

      expect(await pushedBy()).toBe(0);
    });

    // La remise à zéro ne pousse pas par avance : le tick filtre toujours sur l'échéance.
    it("ne part pas avant sa nouvelle échéance quand elle est à venir", async () => {
      const res = await coachG.patch(`/reminders/${snoozedId}`).send({ dueAt: inFuture(24) });
      expect(res.status).toBe(200);

      expect(await pushedBy()).toBe(0);
    });
  });
});

/**
 * Payer ou annuler une facture clôt son rappel « en retard » (#349).
 *
 * Sans cela, le « relancer » généré par le tick restait à traiter — dans le centre, le badge et la
 * tuile du tableau de bord — pour une facture qui n'avait plus rien à relancer. La clôture vit dans
 * la transaction qui change le statut : ce bloc la regarde depuis les trois surfaces du coach.
 */
describe("Payer ou annuler une facture clôt son rappel « en retard » (#349)", () => {
  const SECRET = "e2e-tick-secret-not-for-production";

  let coachP: Agent;
  let paidInvoiceId: string;
  let cancelledInvoiceId: string;
  let manualId: string;

  const monday = mondayOfCurrentWeek();

  type Rmd = { id: string; entityId: string; reason: string | null; status: string };

  const tick = () =>
    request(baseURL).post("/internal/reminders/tick").set("x-cimavia-tick-secret", SECRET);
  const overdueReminderOf = async (invoiceId: string): Promise<Rmd> =>
    required(
      ((await coachP.get("/reminders")).body as Rmd[]).find(
        (r) => r.entityId === invoiceId && r.reason === "INVOICE_OVERDUE",
      ),
      "rappel de facture en retard",
    );
  const dueCount = async (): Promise<number> =>
    (await coachP.get("/reminders/summary")).body.dueCount;
  const inCenter = async (reminderId: string): Promise<boolean> =>
    ((await coachP.get("/me/notifications")).body as { id: string }[]).some(
      (e) => e.id === `reminder:${reminderId}`,
    );

  // Deux cycles facturés, donc deux factures ÉMISES à échéance dépassée (`billAndPublish`).
  const billedPlan = async (athleteId: string, title: string): Promise<string> => {
    const plan = await coachP.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect((await billAndPublish(coachP, plan.body.id)).status).toBe(200);
    const invoices = (await coachP.get("/invoices")).body as { id: string; planId: string }[];
    return required(
      invoices.find((i) => i.planId === plan.body.id),
      "facture émise",
    ).id;
  };

  beforeAll(async () => {
    coachP = await signUp("paid-coach-p@cmv.test", Role.COACH);
    const athleteP1 = await signUp("paid-athlete-p1@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coachP, athleteP1);
    const accepted = await athleteP1.post(`/invitations/${invitation.body.id}/accept`);

    paidInvoiceId = await billedPlan(accepted.body[0].athleteId, "Cycle payé en retard");
    cancelledInvoiceId = await billedPlan(accepted.body[0].athleteId, "Cycle annulé en retard");

    expect((await tick()).status).toBe(200);

    // Un rappel MANUEL, dû, sur la facture qui sera payée : il n'est pas à clore à la place du coach.
    const manual = await coachP.post("/reminders").send({
      entityType: "INVOICE",
      entityId: paidInvoiceId,
      dueAt: new Date(Date.now() - 3_600_000).toISOString(),
      note: "Appeler pour le virement",
    });
    manualId = manual.body.id;
  });

  it("le tick a bien généré un rappel à traiter par facture en retard", async () => {
    expect(await overdueReminderOf(paidInvoiceId)).toMatchObject({ status: "PENDING" });
    expect(await overdueReminderOf(cancelledInvoiceId)).toMatchObject({ status: "PENDING" });
  });

  it("payer la facture clôt son rappel, qui quitte le centre et le décompte", async () => {
    const reminder = await overdueReminderOf(paidInvoiceId);
    expect(await inCenter(reminder.id)).toBe(true);
    const before = await dueCount();

    const paid = await coachP.patch(`/invoices/${paidInvoiceId}/status`).send({ status: "PAID" });
    expect(paid.status).toBe(200);

    expect(await overdueReminderOf(paidInvoiceId)).toMatchObject({ status: "DONE" });
    expect(await inCenter(reminder.id)).toBe(false);
    expect(await dueCount()).toBe(before - 1);
    // Seul le rappel de CETTE facture : l'autre reste à relancer.
    expect(await overdueReminderOf(cancelledInvoiceId)).toMatchObject({ status: "PENDING" });
  });

  it("le rappel manuel posé sur la même facture reste au coach", async () => {
    const manual = ((await coachP.get("/reminders")).body as Rmd[]).find((r) => r.id === manualId);
    expect(manual).toMatchObject({ reason: null, status: "PENDING" });
  });

  /**
   * Tranché en #349 : remettre la facture à régler ne rouvre pas son rappel, et le tick ne le
   * régénère pas — un rappel traité ne l'est jamais (#47). La facture, elle, redevient en retard.
   */
  it("remettre la facture à régler ne rouvre ni ne régénère le rappel", async () => {
    const back = await coachP
      .patch(`/invoices/${paidInvoiceId}/status`)
      .send({ status: "PENDING" });
    expect(back.status).toBe(200);

    const res = await tick();
    expect(res.body.createdReminders).toBe(0);
    expect(await overdueReminderOf(paidInvoiceId)).toMatchObject({ status: "DONE" });
  });

  it("annuler la facture clôt son rappel", async () => {
    const reminder = await overdueReminderOf(cancelledInvoiceId);

    expect((await coachP.post(`/invoices/${cancelledInvoiceId}/cancel`)).status).toBe(200);

    expect(await overdueReminderOf(cancelledInvoiceId)).toMatchObject({ status: "DONE" });
    expect(await inCenter(reminder.id)).toBe(false);
  });
});
