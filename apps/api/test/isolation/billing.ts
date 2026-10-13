import { Role } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, inviteFor, link, linkRelation, signUp } from "../support/actors";
import { mondayOfCurrentWeek } from "../support/fixtures";
import { publishAtLatest } from "../support/version";

describe("Facturation liée au cycle : brouillon, émission & isolation (P6)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let athleteB1: Agent;
  let a1Id: string;
  let coachAId: string;
  let planId: string;
  let invoiceId: string;
  let documentPath: string;

  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    coachA = await signUp("inv-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("inv-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("inv-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("inv-athlete-b1@cmv.test", Role.ATHLETE);

    const relation = await linkRelation(coachA, athleteA1);
    a1Id = relation.athleteId;
    coachAId = relation.coachId;
    await link(coachB, athleteB1);

    // Un cycle DRAFT (une semaine suffit à le rendre diffusable) pour l'athlète A1.
    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle prépa bloc",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    planId = plan.body.id;
  });

  it("refuse de diffuser un cycle sans facturation saisie (gating)", async () => {
    const res = await publishAtLatest(coachA, planId);
    expect(res.status).toBe(400);
    // Le cycle reste en brouillon (rien n'a été diffusé).
    expect((await coachA.get(`/plans/${planId}`)).body.status).toBe("DRAFT");
  });

  it("le coach saisit la facturation : facture DRAFT, période dérivée du cycle", async () => {
    const res = await coachA
      .put(`/plans/${planId}/billing`)
      .send({ amountCents: 4990, dueDate: monday, note: "Coaching mensuel" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      coachId: coachAId,
      athleteId: a1Id,
      planId,
      planTitle: "Cycle prépa bloc",
      amountCents: 4990,
      currency: "EUR",
      status: "DRAFT",
      period: monday.slice(0, 7), // mois de début du cycle
      issuedAt: null,
      paidAt: null,
      note: "Coaching mensuel",
    });
  });

  it("une facture DRAFT est invisible des listes des deux rôles", async () => {
    expect((await coachA.get("/invoices")).body).toHaveLength(0);
    expect((await athleteA1.get("/invoices")).body).toHaveLength(0);
  });

  it("ré-enregistrer la facturation met à jour LA facture du cycle (pas de doublon)", async () => {
    const res = await coachA
      .put(`/plans/${planId}/billing`)
      .send({ amountCents: 5500, dueDate: monday });
    expect(res.status).toBe(200);
    expect(res.body.amountCents).toBe(5500);
    expect(res.body.note).toBeNull();
    // Toujours en brouillon, toujours une seule (get renvoie le brouillon courant).
    const draft = await coachA.get(`/plans/${planId}/billing`);
    expect(draft.body.amountCents).toBe(5500);
  });

  it("l'athlète et un autre coach ne peuvent pas saisir la facturation du cycle", async () => {
    // Rôle : la saisie de facturation est réservée au coach.
    expect(
      (await athleteA1.put(`/plans/${planId}/billing`).send({ amountCents: 1, dueDate: monday }))
        .status,
    ).toBe(403);
    // Scope : le cycle n'appartient pas à coachB.
    expect(
      (await coachB.put(`/plans/${planId}/billing`).send({ amountCents: 1, dueDate: monday }))
        .status,
    ).toBe(404);
  });

  it("le coach joint un justificatif PDF à la facturation (upload signé → rattachement)", async () => {
    const signed = await coachA
      .post(`/plans/${planId}/billing/document/upload-url`)
      .send({ fileName: "facture-juillet.pdf", mimeType: "application/pdf", size: 20_000 });
    expect(signed.status).toBe(201);

    // PUT direct vers le storage (SILO), taille signée opposable — comme les médias de débrief.
    const put = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(20_000, 1),
      headers: { "content-type": "application/pdf" },
    });
    expect(put.status).toBe(200);
    documentPath = signed.body.storagePath;

    const attached = await coachA.put(`/plans/${planId}/billing/document`).send({
      storagePath: documentPath,
      fileName: "facture-juillet.pdf",
      mimeType: "application/pdf",
      size: 20_000,
    });
    expect(attached.status).toBe(200);
    expect(attached.body.documentFileName).toBe("facture-juillet.pdf");
    expect(attached.body.documentUrl).not.toBeNull();
  });

  it("refuse un justificatif non-PDF (400), et un autre coach ne peut pas en joindre (404)", async () => {
    expect(
      (
        await coachA
          .post(`/plans/${planId}/billing/document/upload-url`)
          .send({ fileName: "x.png", mimeType: "image/png", size: 1000 })
      ).status,
    ).toBe(400);
    expect(
      (
        await coachB
          .post(`/plans/${planId}/billing/document/upload-url`)
          .send({ fileName: "x.pdf", mimeType: "application/pdf", size: 1000 })
      ).status,
    ).toBe(404);
  });

  /**
   * Remplacer et retirer le justificatif PURGENT l'objet du bucket (#325) : sans le scope, l'autre
   * coach effacerait le PDF de A. Il tente avec la clé exacte de A, celle qui passerait
   * `assertKeyUnder` si le cycle lui était rendu — et avant la diffusion, quand ces deux écritures
   * sont encore ouvertes à A.
   */
  it("un autre coach ne remplace ni ne retire le justificatif (404), et l'objet reste servi", async () => {
    const replaced = await coachB.put(`/plans/${planId}/billing/document`).send({
      storagePath: documentPath,
      fileName: "detourne.pdf",
      mimeType: "application/pdf",
      size: 20_000,
    });
    const removed = await coachB.delete(`/plans/${planId}/billing/document`);
    expect([replaced.status, removed.status]).toEqual([404, 404]);

    const billing = await coachA.get(`/plans/${planId}/billing`);
    expect(billing.body.documentFileName).toBe("facture-juillet.pdf");
    expect((await fetch(billing.body.documentUrl)).status).toBe(200);
  });

  it("diffuser le cycle émet la facture (DRAFT → PENDING) et notifie l'athlète", async () => {
    const res = await publishAtLatest(coachA, planId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PUBLISHED");

    // L'athlète voit désormais SA facture émise, avec le cycle et le coach nommés.
    const list = await athleteA1.get("/invoices");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      planId,
      planTitle: "Cycle prépa bloc",
      coachName: "inv-coach-a@cmv.test",
      amountCents: 5500,
      status: "PENDING",
      documentFileName: "facture-juillet.pdf",
    });
    expect(list.body[0].issuedAt).not.toBeNull();
    invoiceId = list.body[0].id;

    // Le justificatif joint en DRAFT survit à l'émission : l'athlète le lit par URL GET signée.
    expect(list.body[0].documentUrl).not.toBeNull();
    const pdf = await fetch(list.body[0].documentUrl);
    expect(pdf.status).toBe(200);

    const detail = await athleteA1.get(`/invoices/${invoiceId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.athleteName).toBe("inv-athlete-a1@cmv.test");
  });

  /**
   * Les QUATRE écritures, pas seulement la saisie des termes : une fois la facture émise, ni le
   * montant ni le justificatif ne bougent plus. Les éprouver ensemble est ce qui rend la
   * tolérance de la lecture (#211) lisible — c'est la lecture SEULE qui s'ouvre.
   */
  it("la facturation est figée une fois le cycle diffusé", async () => {
    const saved = await coachA
      .put(`/plans/${planId}/billing`)
      .send({ amountCents: 9999, dueDate: monday });
    expect(saved.status).toBe(400);

    const signed = await coachA
      .post(`/plans/${planId}/billing/document/upload-url`)
      .send({ fileName: "rectif.pdf", mimeType: "application/pdf", size: 1_000 });
    expect(signed.status).toBe(400);

    const attached = await coachA.put(`/plans/${planId}/billing/document`).send({
      storagePath: "athlete/x/invoice/y/rectif.pdf",
      fileName: "rectif.pdf",
      mimeType: "application/pdf",
      size: 1_000,
    });
    expect(attached.status).toBe(400);

    expect((await coachA.delete(`/plans/${planId}/billing/document`)).status).toBe(400);
  });

  /**
   * Le défaut de #211 : ouvrir un cycle diffusé dans le builder déclenchait cette lecture, et
   * l'API la refusait en 400 — une rafale de requêtes vouées à l'échec, qui aurait fait du bruit
   * dans Sentry sans désigner de panne.
   *
   * `null` n'est pas une concession : la facture est passée PENDING dans la transaction du
   * `publish`, il n'y a PLUS de brouillon à lire. La réponse est vraie, elle l'a toujours été.
   */
  it("lire la facturation d'un cycle diffusé rend null, pas une erreur", async () => {
    const read = await coachA.get(`/plans/${planId}/billing`);
    expect(read.status).toBe(200);
    expect(read.body).toBeNull();

    // Le scope tenant garde le dernier mot : le cycle d'un autre coach reste introuvable.
    expect((await coachB.get(`/plans/${planId}/billing`)).status).toBe(404);
  });

  it("un autre coach ne voit ni ne modifie la facture (scope tenant → 404)", async () => {
    expect((await coachB.get("/invoices")).body).toHaveLength(0);
    expect((await coachB.get(`/invoices/${invoiceId}`)).status).toBe(404);
    expect(
      (await coachB.patch(`/invoices/${invoiceId}/status`).send({ status: "PAID" })).status,
    ).toBe(404);
  });

  it("un athlète d'un autre coach ne voit pas la facture", async () => {
    expect((await athleteB1.get("/invoices")).body).toHaveLength(0);
    expect((await athleteB1.get(`/invoices/${invoiceId}`)).status).toBe(404);
  });

  it("l'athlète ne peut pas changer le statut (403)", async () => {
    expect(
      (await athleteA1.patch(`/invoices/${invoiceId}/status`).send({ status: "PAID" })).status,
    ).toBe(403);
  });

  it("le coach marque payé (paidAt posé), puis rouvre (paidAt effacé) — toggle", async () => {
    const paid = await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "PAID" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("PAID");
    expect(paid.body.paidAt).not.toBeNull();

    const reopened = await coachA
      .patch(`/invoices/${invoiceId}/status`)
      .send({ status: "PENDING" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("PENDING");
    expect(reopened.body.paidAt).toBeNull();
  });

  // Un double clic ne doit pas redater le paiement : `paidAt` dit QUAND l'athlète a payé.
  it("remarquer payé une facture déjà payée ne redate rien", async () => {
    const first = await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "PAID" });
    const again = await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "PAID" });

    expect(again.status).toBe(200);
    expect(again.body.paidAt).toBe(first.body.paidAt);

    await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "PENDING" });
  });

  it("refuse un statut invalide au toggle (ni DRAFT, ni CANCELLED, ni valeur inconnue)", async () => {
    expect(
      (await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "DRAFT" })).status,
    ).toBe(400);
    // CANCELLED est un statut ÉMIS valide, mais il a sa route gardée : le toggle le refuse.
    expect(
      (await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "CANCELLED" })).status,
    ).toBe(400);
    expect(
      (await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "NOPE" })).status,
    ).toBe(400);
  });

  it("l'annulation est réservée au coach propriétaire (403 athlète, 404 autre coach)", async () => {
    expect((await athleteA1.post(`/invoices/${invoiceId}/cancel`)).status).toBe(403);
    expect((await coachB.post(`/invoices/${invoiceId}/cancel`)).status).toBe(404);
    // Ni l'un ni l'autre n'a modifié la facture.
    expect((await coachA.get(`/invoices/${invoiceId}`)).body.status).toBe("PENDING");
  });

  it("refuse d'annuler une facture payée (409), sans changer son statut", async () => {
    await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "PAID" });

    expect((await coachA.post(`/invoices/${invoiceId}/cancel`)).status).toBe(409);
    expect((await coachA.get(`/invoices/${invoiceId}`)).body.status).toBe("PAID");

    // On la rouvre pour la suite : l'annulation ne part que d'une facture en attente.
    await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "PENDING" });
  });

  it("le coach annule une facture en attente, sans toucher au cycle diffusé", async () => {
    const cancelled = await coachA.post(`/invoices/${invoiceId}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: "CANCELLED", paidAt: null });

    // L'annulation porte sur la facture SEULE : la prestation reste diffusée.
    expect((await coachA.get(`/plans/${planId}`)).body.status).toBe("PUBLISHED");
  });

  it("une facture annulée est terminale : ni ré-annulation, ni retour par le toggle (409)", async () => {
    expect((await coachA.post(`/invoices/${invoiceId}/cancel`)).status).toBe(409);
    expect(
      (await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "PENDING" })).status,
    ).toBe(409);
    expect(
      (await coachA.patch(`/invoices/${invoiceId}/status`).send({ status: "PAID" })).status,
    ).toBe(409);
    expect((await coachA.get(`/invoices/${invoiceId}`)).body.status).toBe("CANCELLED");
  });

  it("l'athlète voit sa facture annulée (elle ne disparaît pas de sa liste)", async () => {
    const list = await athleteA1.get("/invoices");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: invoiceId, status: "CANCELLED" });
  });
});

/**
 * Le justificatif PDF d'une facture en brouillon, au-delà du premier rattachement : le remplacer,
 * le retirer quand il n'y en a pas, le joindre trop tôt. Remplacer purge l'ancien objet — sa clé
 * n'appartient qu'à cette facture, et sans purge il resterait facturé, invisible, pour toujours.
 */
describe("Justificatif de facture : remplacement et retrait", () => {
  let coach: Agent;
  let planId: string;

  const monday = mondayOfCurrentWeek();

  async function uploadPdf(fileName: string) {
    const signed = await coach
      .post(`/plans/${planId}/billing/document/upload-url`)
      .send({ fileName, mimeType: "application/pdf", size: 1_000 });
    expect(signed.status).toBe(201);
    const put = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(1_000, 1),
      headers: { "content-type": "application/pdf" },
    });
    expect(put.status).toBe(200);
    return {
      storagePath: signed.body.storagePath,
      fileName,
      mimeType: "application/pdf",
      size: 1_000,
    };
  }

  beforeAll(async () => {
    coach = await signUp("doc-coach@cmv.test", Role.COACH);
    const athlete = await signUp("doc-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    const plan = await coach
      .post("/plans")
      .send({ athleteId: accepted.body[0].athleteId, title: "Facturé", startDate: monday });
    planId = plan.body.id;
  });

  // Le justificatif se rattache à LA facture brouillon : sans termes saisis, il n'y en a pas.
  it("refuse un PDF tant que la facturation n'est pas saisie", async () => {
    const document = await uploadPdf("trop-tot.pdf");

    const res = await coach.put(`/plans/${planId}/billing/document`).send(document);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Enregistre d'abord la facturation avant de joindre un PDF");
  });

  it("retirer un justificatif absent ne change rien et ne lève pas", async () => {
    await coach.put(`/plans/${planId}/billing`).send({ amountCents: 5000, dueDate: monday });

    const res = await coach.delete(`/plans/${planId}/billing/document`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amountCents: 5000,
      documentFileName: null,
      documentUrl: null,
    });
  });

  it("remplacer le justificatif purge l'ancien objet ; rejoindre le même le garde", async () => {
    const first = await coach
      .put(`/plans/${planId}/billing/document`)
      .send(await uploadPdf("v1.pdf"));
    expect((await fetch(first.body.documentUrl)).status).toBe(200);

    const secondDocument = await uploadPdf("v2.pdf");
    const second = await coach.put(`/plans/${planId}/billing/document`).send(secondDocument);

    expect(second.body.documentFileName).toBe("v2.pdf");
    expect((await fetch(first.body.documentUrl)).status).toBe(404);

    // Même clé renvoyée (un double envoi du formulaire) : ce n'est pas un remplacement.
    const again = await coach.put(`/plans/${planId}/billing/document`).send(secondDocument);
    expect((await fetch(again.body.documentUrl)).status).toBe(200);
  });
});
