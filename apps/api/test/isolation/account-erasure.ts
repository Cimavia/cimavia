import { Role } from "@cmv/shared";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ERASURE_MAX_FAILURES } from "../../src/erasure/service/erasure-attempts.service";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { StorageService } from "../../src/infra/storage/storage.service";
import {
  type Agent,
  billAndPublish,
  emailOf,
  idOf,
  joinOrganization,
  linkRelation,
  openWith,
  PASSWORD,
  signUp,
  signUpWith,
} from "../support/actors";
import { app, baseURL, sentMails } from "../support/app";
import { blocksOf } from "../support/blocks";
import { attachInvoiceDocument, mondayOfCurrentWeek, putExerciseFile } from "../support/fixtures";

/**
 * Supprimer son compte (#256). Comptes préfixés `erasure-`, pour ne croiser aucun autre domaine.
 * Chaque cas crée les siens : un compte effacé ne sert qu'une fois.
 */

const TOPO = { fileName: "topo.pdf", mimeType: "application/pdf", size: 1000 };

describe("Supprimer son compte : ni ligne ni objet restant, et personne d'autre (#256)", () => {
  let prisma: PrismaService;
  let storage: StorageService;

  const eraseAs = (agent: Agent, password = PASSWORD) =>
    agent.post("/me/erasure").send({ password });

  const objectStatus = async (key: string) =>
    (await fetch(await storage.createDownloadUrl(key))).status;

  /** Un cycle diffusé à l'athlète : sa facture est émise. Rend le cycle. */
  async function publishedPlanFor(coach: Agent, athleteId: string): Promise<string> {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle à solder",
      startDate: mondayOfCurrentWeek(),
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    return plan.body.id;
  }

  /** Un exercice de `coach` avec un fichier réellement envoyé. Rend l'exercice et sa clé. */
  async function exerciseWithFile(coach: Agent, title: string) {
    const created = await coach.post("/exercises").send({ title });
    expect(created.status).toBe(201);
    const storagePath = await putExerciseFile(coach, created.body.id, TOPO);
    const attached = await coach
      .post(`/exercises/${created.body.id}/documents`)
      .send({ type: "FILE", storagePath, ...TOPO });
    expect(attached.status).toBe(201);
    return { exerciseId: created.body.id as string, storagePath };
  }

  async function sessionCiting(coach: Agent, exerciseId: string) {
    const created = await coach.post("/sessions").send({
      title: "Séance citante",
      blocks: blocksOf({ exerciseId }),
    });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  beforeAll(() => {
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
  });

  it("refuse un mauvais mot de passe, et le compte reste entier", async () => {
    const athlete = await signUp("erasure-wrong@cmv.test", Role.ATHLETE);
    const refused = await eraseAs(athlete, "pas-le-bon");
    expect(refused.status).toBe(403);
    expect(refused.body.type).toBe("urn:cimavia:problem:erasure-password-rejected");
    expect((await athlete.get("/api/auth/get-session")).body?.user).toBeDefined();
  });

  it("refuse sans session", async () => {
    const athlete = await signUp("erasure-anon@cmv.test", Role.ATHLETE);
    const id = await idOf(athlete);
    const anonymous = await request(baseURL).post("/me/erasure").send({ password: PASSWORD });
    expect(anonymous.status).toBe(401);
    expect(await prisma.user.count({ where: { id } })).toBe(1);
  });

  it("n'accepte aucun champ qui désignerait un autre compte", async () => {
    const athlete = await signUp("erasure-strict@cmv.test", Role.ATHLETE);
    const other = await signUp("erasure-strict-b@cmv.test", Role.ATHLETE);
    const forged = await athlete
      .post("/me/erasure")
      .send({ password: PASSWORD, userId: await idOf(other) });
    expect(forged.status).toBe(400);
    expect(await prisma.user.count({ where: { id: await idOf(other) } })).toBe(1);
  });

  it("plafonne les mauvais mots de passe, même si le bon arrive ensuite", async () => {
    const athlete = await signUp("erasure-limit@cmv.test", Role.ATHLETE);
    for (let i = 0; i < ERASURE_MAX_FAILURES; i += 1) {
      expect((await eraseAs(athlete, "pas-le-bon")).status).toBe(403);
    }
    expect((await eraseAs(athlete)).status).toBe(429);
    expect((await athlete.get("/api/auth/get-session")).body?.user).toBeDefined();
  });

  it("l'athlète parti : sa facture émise reste chez le coach, le reste disparaît", async () => {
    const coach = await signUp("erasure-coach-a@cmv.test", Role.COACH);
    const athlete = await signUp("erasure-athlete-a@cmv.test", Role.ATHLETE);
    const { athleteId, coachId } = await linkRelation(coach, athlete);
    const planId = await publishedPlanFor(coach, athleteId);
    await coach.put(`/plans/${planId}/billing`).send({ amountCents: 5000, dueDate: "2026-01-05" });
    const documentPath = await attachInvoiceDocument(coach, planId);
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    const email = await emailOf(athlete);

    const opened = await openWith(coach, athleteId, "athlete");
    expect(opened.status).toBe(201);
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { planId } });
    sentMails.length = 0;

    expect((await eraseAs(athlete)).status).toBe(204);

    expect(await prisma.user.count({ where: { id: athleteId } })).toBe(0);
    expect(await prisma.plan.count({ where: { id: planId } })).toBe(0);
    expect(await prisma.conversation.count({ where: { id: opened.body.id } })).toBe(0);
    expect(
      await prisma.invitation.count({ where: { email: { equals: email, mode: "insensitive" } } }),
    ).toBe(0);
    expect(
      await prisma.notification.count({ where: { entityId: { in: [planId, invoice.id] } } }),
    ).toBe(0);

    // Facture : plus de cycle, nom figé, justificatif toujours là — elle reste une pièce du coach.
    const list = await coach.get("/invoices");
    expect(list.status).toBe(200);
    const kept = list.body.find((row: { id: string }) => row.id === invoice.id);
    expect(kept).toMatchObject({ planId: null, athleteId, coachId });
    expect(kept.athleteName).toBeTruthy();
    expect(await objectStatus(documentPath)).toBe(200);

    expect(sentMails.map((mail) => mail.to)).toContain(email);
    // La session d'hier ne survit pas au compte.
    expect((await athlete.get("/plans")).status).toBe(401);
  });

  it("ne relance plus un athlète parti, et le coach peut encore encaisser", async () => {
    const coach = await signUp("erasure-coach-b@cmv.test", Role.COACH);
    const athlete = await signUp("erasure-athlete-b@cmv.test", Role.ATHLETE);
    const { athleteId } = await linkRelation(coach, athlete);
    const planId = await publishedPlanFor(coach, athleteId);
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { planId } });
    // Témoin : le même coach, une facture tout aussi échue, un athlète qui reste.
    const staying = await signUp("erasure-athlete-c@cmv.test", Role.ATHLETE);
    const other = await linkRelation(coach, staying);
    const otherPlanId = await publishedPlanFor(coach, other.athleteId);
    expect((await billAndPublish(coach, otherPlanId)).status).toBe(200);
    const witness = await prisma.invoice.findFirstOrThrow({ where: { planId: otherPlanId } });
    expect((await eraseAs(athlete)).status).toBe(204);

    const tick = await request(baseURL)
      .post("/internal/reminders/tick")
      .set("x-cimavia-tick-secret", "e2e-tick-secret-not-for-production");
    expect(tick.status).toBe(200);
    const remindedFor = (entityId: string) =>
      prisma.reminder.count({ where: { entityType: "INVOICE", entityId } });
    expect(await remindedFor(witness.id)).toBe(1);
    expect(await remindedFor(invoice.id)).toBe(0);

    const paid = await coach.patch(`/invoices/${invoice.id}/status`).send({ status: "PAID" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("PAID");
  });

  it("un coach dont les séances citent ses propres exercices peut partir, ses objets aussi", async () => {
    const coach = await signUp("erasure-coach-c@cmv.test", Role.COACH);
    const { exerciseId, storagePath } = await exerciseWithFile(coach, "Bloc perso");
    const sessionId = await sessionCiting(coach, exerciseId);
    expect(await objectStatus(storagePath)).toBe(200);

    expect((await eraseAs(coach)).status).toBe(204);

    expect(await prisma.exercise.count({ where: { id: exerciseId } })).toBe(0);
    expect(await prisma.session.count({ where: { id: sessionId } })).toBe(0);
    // Après la réponse : le retrait des objets ne la retient pas.
    await vi.waitFor(async () => expect(await objectStatus(storagePath)).toBe(404), {
      timeout: 5_000,
    });
    await vi.waitFor(
      async () =>
        expect(await prisma.pendingObjectDeletion.count({ where: { key: storagePath } })).toBe(0),
      { timeout: 5_000 },
    );
  });

  it("garde à l'autre Coach une copie figée, et l'objet qu'elle partage", async () => {
    const company = await signUpWith("erasure-f@cmv.test", {
      isCoach: false,
      isAthlete: false,
      isCompany: true,
    });
    const leaving = await signUp("erasure-coach-d@cmv.test", Role.COACH);
    const staying = await signUp("erasure-coach-e@cmv.test", Role.COACH);
    await joinOrganization(company, leaving);
    await joinOrganization(company, staying);
    const stayingId = await idOf(staying);
    const leavingId = await idOf(leaving);
    const { exerciseId, storagePath } = await exerciseWithFile(leaving, "Bloc partagé");
    await prisma.accessGrant.create({
      data: { ownerId: leavingId, exerciseId, organizationId: await idOf(company), level: "READ" },
    });
    const sessionId = await sessionCiting(staying, exerciseId);

    expect((await eraseAs(leaving)).status).toBe(204);

    const lines = await prisma.sessionExercise.findMany({
      where: { sessionId },
      include: { exercise: { include: { documents: true } } },
    });
    expect(lines).toHaveLength(1);
    const copy = lines[0]?.exercise;
    expect(copy).toMatchObject({ coachId: stayingId, frozenFromCoachId: null });
    expect(copy?.documents.map((document) => document.storagePath)).toEqual([storagePath]);
    expect(await objectStatus(storagePath)).toBe(200);
    expect((await staying.get(`/sessions/${sessionId}`)).status).toBe(200);
  });

  it("un second envoi simultané ne casse rien : un seul part, l'autre dit introuvable", async () => {
    const athlete = await signUp("erasure-twice@cmv.test", Role.ATHLETE);
    const statuses = (await Promise.all([eraseAs(athlete), eraseAs(athlete)])).map(
      (response) => response.status,
    );
    expect(statuses).toContain(204);
    expect(statuses.every((status) => [204, 401, 404].includes(status))).toBe(true);
  });

  it("le _ d'une adresse n'est pas un joker : l'invitation d'un autre reste", async () => {
    const coach = await signUp("erasure-coach-j@cmv.test", Role.COACH);
    const leaving = await signUp("erasure_twin@cmv.test", Role.ATHLETE);
    const other = await prisma.invitation.create({
      data: {
        email: "erasureXtwin@cmv.test",
        coachId: await idOf(coach),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    expect((await eraseAs(leaving)).status).toBe(204);

    expect(await prisma.invitation.count({ where: { id: other.id } })).toBe(1);
  });

  it("n'efface que son propre compte : le coach lié garde tout le reste", async () => {
    const coach = await signUp("erasure-coach-g@cmv.test", Role.COACH);
    const leaving = await signUp("erasure-athlete-g@cmv.test", Role.ATHLETE);
    const staying = await signUp("erasure-athlete-h@cmv.test", Role.ATHLETE);
    const first = await linkRelation(coach, leaving);
    const second = await linkRelation(coach, staying);
    const keptPlan = await publishedPlanFor(coach, second.athleteId);
    await publishedPlanFor(coach, first.athleteId);

    expect((await eraseAs(leaving)).status).toBe(204);

    expect(await prisma.user.count({ where: { id: second.athleteId } })).toBe(1);
    expect(await prisma.user.count({ where: { id: first.coachId } })).toBe(1);
    expect((await coach.get(`/plans/${keptPlan}`)).status).toBe(200);
  });

  it("vide au tick suivant un objet que la fin d'effacement n'a pas pu retirer", async () => {
    const key = `erasure/${Date.now()}/absent.pdf`;
    await prisma.pendingObjectDeletion.create({ data: { key } });
    const tick = await request(baseURL)
      .post("/internal/reminders/tick")
      .set("x-cimavia-tick-secret", "e2e-tick-secret-not-for-production");
    expect(tick.status).toBe(200);
    expect(tick.body.purgedObjects).toBeGreaterThanOrEqual(1);
    expect(await prisma.pendingObjectDeletion.count({ where: { key } })).toBe(0);
  });
});
