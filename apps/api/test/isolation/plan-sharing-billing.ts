import { InvoiceStatus, MyAccessLevel, ReminderEntityType, ReminderReason } from "@cmv/shared";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish } from "../support/actors";
import { baseURL } from "../support/app";
import { grantPlan, type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";
import { publishAtLatest } from "../support/version";

/**
 * La facture d'une planification partagée (#607) : elle suit son cycle. La Lecture l'ouvre en
 * lecture seule, l'Écriture en ouvre la gestion — termes, justificatif, statut —, et elle reste
 * émise au nom de C. Les rappels, eux, restent à C. Comptes `plan-share-bill-`.
 */
describe("Facture d'un cycle partagé : elle suit le cycle, au nom de son propriétaire", () => {
  let world: SharedPlanWorld;
  let invoiceId: string;
  const billingPath = () => `/plans/${world.planTi.id}/billing`;
  // Une échéance largement passée : la facture émise est en retard, le tick la relance.
  const terms = { amountCents: 7000, dueDate: "2026-01-05" };

  // Le cron, sans session : le secret fixé par `vitest.config.e2e.ts`.
  const tick = () =>
    request(baseURL)
      .post("/internal/reminders/tick")
      .set("x-cimavia-tick-secret", "e2e-tick-secret-not-for-production");
  const overdueOf = async (agent: Agent, id: string) =>
    ((await agent.get("/reminders")).body as { entityId: string; reason: string | null }[]).filter(
      (reminder) => reminder.entityId === id && reminder.reason === ReminderReason.INVOICE_OVERDUE,
    );

  beforeAll(async () => {
    world = await sharedPlanWorld("plan-share-bill");
    const billed = await world.c.put(billingPath()).send(terms);
    expect(billed.status).toBe(200);
  });

  it("en Lecture, M lit les termes de C sans pouvoir les toucher", async () => {
    await grantPlan(world, world.planTi.id, "READ");

    const read = await world.m.get(billingPath());
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      coachId: world.ids.c,
      amountCents: terms.amountCents,
      myAccess: { level: MyAccessLevel.READ, via: { id: world.ids.organization } },
    });

    const pdf = { fileName: "facture.pdf", mimeType: "application/pdf", size: 1000 };
    const attempts = await Promise.all([
      world.m.put(billingPath()).send({ ...terms, amountCents: 1 }),
      world.m.post(`${billingPath()}/document/upload-url`).send(pdf),
      world.m.put(`${billingPath()}/document`).send({ storagePath: "intrusion.pdf", ...pdf }),
      world.m.delete(`${billingPath()}/document`),
    ]);
    expect(attempts.map((res) => res.status)).toEqual([403, 403, 403, 403]);
    expect((await world.c.get(billingPath())).body.amountCents).toBe(terms.amountCents);
  });

  it("sans droit, M et les Coachs hors de l'audience ne la trouvent pas", async () => {
    await grantPlan(world, world.planTi.id, null);
    for (const outsider of [world.m, world.n, world.b]) {
      expect((await outsider.get(billingPath())).status).toBe(404);
    }
  });

  it("en Écriture, M règle les termes et diffuse : la facture part au nom de C", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");

    const saved = await world.m.put(billingPath()).send({ ...terms, note: "Revue par M" });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ coachId: world.ids.c, note: "Revue par M" });
    expect((await publishAtLatest(world.m, world.planTi.id)).status).toBe(200);

    const mine = await world.m.get("/invoices");
    const issued = mine.body.find(
      (invoice: { planId: string }) => invoice.planId === world.planTi.id,
    );
    expect(issued).toMatchObject({
      coachId: world.ids.c,
      status: InvoiceStatus.PENDING,
      myAccess: { level: MyAccessLevel.WRITE, via: { id: world.ids.organization } },
    });
    invoiceId = issued.id;

    expect((await world.c.get(`/invoices/${invoiceId}`)).body.myAccess).toEqual({
      level: MyAccessLevel.OWNER,
      via: null,
    });
    // L'athlète en est le destinataire : il n'a pas de droit à dire.
    const forTi = (await world.ti.get("/invoices")).body.find(
      (invoice: { id: string }) => invoice.id === invoiceId,
    );
    expect(forTi).toMatchObject({ coachId: world.ids.c, myAccess: null });
  });

  it("les rappels restent à C : M n'en reçoit pas et ne peut en poser", async () => {
    expect((await tick()).status).toBe(200);

    expect(await overdueOf(world.c, invoiceId)).toHaveLength(1);
    expect(await overdueOf(world.m, invoiceId)).toHaveLength(0);
    // Le cycle et sa facture se lisent, mais ne sont pas à M : même refus qu'une cible inconnue.
    const dueAt = new Date().toISOString();
    for (const [entityType, entityId] of [
      [ReminderEntityType.PLAN, world.planTi.id],
      [ReminderEntityType.INVOICE, invoiceId],
    ] as const) {
      const res = await world.m.post("/reminders").send({ entityType, entityId, dueAt, note: "M" });
      expect(res.status).toBe(400);
    }
  });

  it("en Lecture, M ne change pas le statut de la facture", async () => {
    await grantPlan(world, world.planTi.id, "READ");

    const paid = await world.m
      .patch(`/invoices/${invoiceId}/status`)
      .send({ status: InvoiceStatus.PAID });
    expect(paid.status).toBe(403);
    expect((await world.m.post(`/invoices/${invoiceId}/cancel`)).status).toBe(403);
    expect((await world.c.get(`/invoices/${invoiceId}`)).body.status).toBe(InvoiceStatus.PENDING);
  });

  it("en Écriture, M la marque payée, et le tick clôt le rappel de C", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");

    const paid = await world.m
      .patch(`/invoices/${invoiceId}/status`)
      .send({ status: InvoiceStatus.PAID });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ coachId: world.ids.c, status: InvoiceStatus.PAID });

    // La transaction de M ne voit pas le rappel de C : il reste ouvert jusqu'au passage suivant.
    expect((await tick()).status).toBe(200);
    expect(await overdueOf(world.c, invoiceId)).toEqual([
      expect.objectContaining({ status: "DONE" }),
    ]);
  });

  it("la facture d'un cycle qui n'est pas ouvert reste à C", async () => {
    await billAndPublish(world.c, world.planTe.id);
    const forTe = (await world.c.get("/invoices")).body.find(
      (invoice: { planId: string }) => invoice.planId === world.planTe.id,
    );
    expect(forTe.myAccess).toEqual({ level: MyAccessLevel.OWNER, via: null });
    expect((await world.m.get(`/invoices/${forTe.id}`)).status).toBe(404);
  });
});
