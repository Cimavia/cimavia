import { EMAILABLE_NOTIFICATION_TYPES, Role } from "@cmv/shared";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import {
  type Agent,
  billAndPublish,
  inviteFor,
  required,
  signUp,
  signUpWith,
} from "../support/actors";
import { app, baseURL, sentMails } from "../support/app";
import { mondayOfCurrentWeek } from "../support/fixtures";
import { deleteAtLatest, publishAtLatest, putAtLatest } from "../support/version";

describe("Tokens de notification push (P4)", () => {
  let coach: Agent;
  let athlete: Agent;
  let other: Agent;

  const TOKEN = "ExponentPushToken[athlete-device-1]";
  // Le secret émis à l'athlète au premier enregistrement — ce que `expo-secure-store` garderait.
  let secret: string;

  beforeAll(async () => {
    coach = await signUp("push-coach@cmv.test", Role.COACH);
    athlete = await signUp("push-athlete@cmv.test", Role.ATHLETE);
    other = await signUp("push-other@cmv.test", Role.ATHLETE);
  });

  // Les deux rôles reçoivent des notifications : la route n'est pas réservée à l'un d'eux.
  it("coach comme athlète enregistrent leur appareil", async () => {
    const asAthlete = await athlete.post("/me/push-tokens").send({ token: TOKEN, platform: "IOS" });
    expect(asAthlete.status).toBe(201);
    expect(asAthlete.body).toMatchObject({ token: TOKEN, platform: "IOS" });

    // Le secret d'installation (#90) est émis ICI, et une seule fois : la base n'en garde que
    // l'empreinte, personne ne pourra le redonner.
    expect(typeof asAthlete.body.installationSecret).toBe("string");
    secret = asAthlete.body.installationSecret;

    const asCoach = await coach
      .post("/me/push-tokens")
      .send({ token: "ExponentPushToken[coach-device]", platform: "ANDROID" });
    expect(asCoach.status).toBe(201);
  });

  // L'app réenregistre son token à chaque démarrage : ce n'est pas un doublon.
  it("réenregistrer le même appareil met la ligne à jour sans réémettre de secret", async () => {
    const again = await athlete
      .post("/me/push-tokens")
      .send({ token: TOKEN, platform: "ANDROID", installationSecret: secret });
    expect(again.status).toBe(201);
    expect(again.body.platform).toBe("ANDROID");
    // `null` dit « garde celui que tu as », et surtout pas « tu n'en as pas ».
    expect(again.body.installationSecret).toBeNull();
  });

  // Chemin de reprise d'un SecureStore effacé : la session prouve déjà que la ligne est à lui.
  it("réémet un secret au propriétaire qui a perdu le sien", async () => {
    const res = await athlete.post("/me/push-tokens").send({ token: TOKEN, platform: "IOS" });

    expect(res.status).toBe(201);
    expect(typeof res.body.installationSecret).toBe("string");
    expect(res.body.installationSecret).not.toBe(secret);
    secret = res.body.installationSecret;
  });

  // Le cœur de #90 : connaître l'adresse ne suffit plus. Sans ce refus, qui connaîtrait le token
  // d'un tiers le priverait de ses notifications (dette P4-3).
  it("refuse la réaffectation à qui ne connaît que le token", async () => {
    const withoutSecret = await other
      .post("/me/push-tokens")
      .send({ token: TOKEN, platform: "IOS" });
    expect(withoutSecret.status).toBe(403);

    const withWrongSecret = await other
      .post("/me/push-tokens")
      .send({ token: TOKEN, platform: "IOS", installationSecret: "z".repeat(43) });
    expect(withWrongSecret.status).toBe(403);

    // Et la victime garde son appareil : le refus n'a rien détaché au passage.
    const stillMine = await athlete
      .post("/me/push-tokens")
      .send({ token: TOKEN, platform: "IOS", installationSecret: secret });
    expect(stillMine.body.installationSecret).toBeNull();
  });

  // Le token est unique en base : sans réaffectation, se reconnecter avec un autre compte sur
  // le même téléphone violerait la contrainte (500). C'est le cas du dev qui teste coach puis
  // athlète sur le même téléphone — il doit continuer de passer.
  it("réaffecte un appareil qui change de main sur preuve d'installation", async () => {
    const handover = await other
      .post("/me/push-tokens")
      .send({ token: TOKEN, platform: "IOS", installationSecret: secret });
    expect(handover.status).toBe(201);
    // Le secret survit à la bascule : le nouveau compte le détient déjà, rien à réémettre.
    expect(handover.body.installationSecret).toBeNull();

    // L'ancien propriétaire ne le révoque plus : la ligne ne lui appartient plus.
    const revokeByPrevious = await athlete.delete(`/me/push-tokens/${TOKEN}`);
    expect(revokeByPrevious.status).toBe(204);
    expect(
      (
        await other
          .post("/me/push-tokens")
          .send({ token: TOKEN, platform: "IOS", installationSecret: secret })
      ).status,
    ).toBe(201);
  });

  // Toutes les lignes d'avant #90 sont dans ce cas. Les refuser condamnerait les appareils de la
  // bêta : on adopte, et le même geste scelle la ligne — la fenêtre se referme d'elle-même.
  it("adopte une ligne héritée sans empreinte, puis la scelle", async () => {
    const legacy = "ExponentPushToken[appareil-herite]";
    const owner = await signUp("push-legacy@cmv.test", Role.ATHLETE);
    await owner.post("/me/push-tokens").send({ token: legacy, platform: "IOS" });
    // Ce qu'est une ligne d'avant #90 : la colonne n'existait pas.
    await app.get(PrismaService).pushToken.update({
      where: { token: legacy },
      data: { installationSecretHash: null },
    });

    const adopted = await other.post("/me/push-tokens").send({ token: legacy, platform: "IOS" });
    expect(adopted.status).toBe(201);
    expect(typeof adopted.body.installationSecret).toBe("string");

    // Scellée : la même requête, rejouée, ne passe plus.
    expect(
      (await owner.post("/me/push-tokens").send({ token: legacy, platform: "IOS" })).status,
    ).toBe(403);
  });

  it("refuse un secret d'installation malformé (400)", async () => {
    const res = await athlete
      .post("/me/push-tokens")
      .send({ token: TOKEN, platform: "IOS", installationSecret: "court" });
    expect(res.status).toBe(400);
  });

  it("refuse un token qui ne pourrait jamais être livré (400)", async () => {
    const res = await athlete.post("/me/push-tokens").send({ token: "bidon", platform: "IOS" });
    expect(res.status).toBe(400);

    const badPlatform = await athlete
      .post("/me/push-tokens")
      .send({ token: "ExponentPushToken[x]", platform: "WEB" });
    expect(badPlatform.status).toBe(400);
  });

  it("révoquer est silencieux sur un token inconnu (une déconnexion n'échoue pas)", async () => {
    const res = await athlete.delete("/me/push-tokens/ExponentPushToken[jamais-vu]");
    expect(res.status).toBe(204);
  });

  // Sans appareil enregistré, l'événement métier réussit quand même : un push est un effet de
  // bord, jamais une transaction (c'est ce qui garde ces e2e verts sans téléphone).
  it("débriefer réussit sans appareil enregistré", async () => {
    const c = await signUp("push-flow-coach@cmv.test", Role.COACH);
    const a = await signUp("push-flow-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(c, a);
    const accepted = await a.post(`/invitations/${invitation.body.id}/accept`);

    const monday = mondayOfCurrentWeek();
    const plan = await c.post("/plans").send({
      athleteId: accepted.body[0].athleteId,
      title: "Cycle push",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await c
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: "Séance", scheduledDate: monday });
    expect((await billAndPublish(c, plan.body.id)).status).toBe(200);

    const feedback = await a
      .put(`/me/scheduled-sessions/${session.body.id}/feedback`)
      .send({ content: "RAS" });
    expect(feedback.status).toBe(200);

    // Ajustement en cours de cycle diffusé (CDC §5.7) : notifie l'athlète, sans échouer.
    const adjusted = await putAtLatest(c, `/scheduled-sessions/${session.body.id}`, {
      title: "Séance (ajustée)",
      notes: null,
      scheduledDate: monday,
      exercises: [],
    });
    expect(adjusted.status).toBe(200);
  });
});

describe("Centre de notifications (#48)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let athleteB1: Agent;
  let a1Id: string;
  let planId: string;
  let planWeekId: string;
  let sessionId: string;
  let conversationId: string;

  const monday = mondayOfCurrentWeek();
  // `signUp` pose `name = email` : c'est donc l'email qu'on retrouve en `actorName`.
  const COACH_A = "notif-coach-a@cmv.test";
  const ATHLETE_A1 = "notif-athlete-a1@cmv.test";

  type Notif = {
    id: string;
    type: string;
    entityType: string;
    entityId: string;
    actorName: string | null;
    subjectLabel: string | null;
    readAt: string | null;
    createdAt: string;
  };

  const inbox = async (agent: Agent): Promise<Notif[]> =>
    (await agent.get("/me/notifications")).body;
  const unread = async (agent: Agent): Promise<number> =>
    (await agent.get("/me/notifications/unread-count")).body.count;
  // La diffusion émet DEUX notifications d'affilée (cycle + facture) : à la milliseconde près
  // leur ordre relatif n'est pas garanti, on cherche donc par type plutôt que par position.
  const find = async (agent: Agent, type: string): Promise<Notif | undefined> =>
    (await inbox(agent)).find((notification) => notification.type === type);

  beforeAll(async () => {
    coachA = await signUp(COACH_A, Role.COACH);
    athleteA1 = await signUp(ATHLETE_A1, Role.ATHLETE);
    coachB = await signUp("notif-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("notif-athlete-b1@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coachA, athleteA1);
    const accepted = await athleteA1.post(`/invitations/${invitation.body.id}/accept`);
    a1Id = accepted.body[0].athleteId;

    const invitationB = await inviteFor(coachB, athleteB1);
    await athleteB1.post(`/invitations/${invitationB.body.id}/accept`);

    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle notifications",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;
    planWeekId = plan.body.weeks[0].id;
    const session = await coachA
      .post(`/plan-weeks/${planWeekId}/sessions`)
      .send({ title: "Séance test", scheduledDate: monday });
    sessionId = session.body.id;

    // ⚠️ AUCUN token push n'est enregistré dans ce bloc : tout ce qui suit vérifie donc la trace
    // persistée SEULE, exactement la situation d'un compte qui n'a jamais ouvert le mobile.
    expect((await billAndPublish(coachA, planId)).status).toBe(200);
  });

  it("la diffusion laisse deux traces chez l'athlète : le cycle et sa facture", async () => {
    // L'invitation qui a noué la relation est là aussi, puisqu'elle visait son adresse (#390) :
    // elle ne vient pas de la diffusion, qui est seule mesurée ici.
    const list = (await inbox(athleteA1)).filter((n) => n.type !== "INVITATION_RECEIVED");
    expect(list).toHaveLength(2);

    expect(list.find((n) => n.type === "PLAN_PUBLISHED")).toMatchObject({
      entityType: "PLAN",
      entityId: planId,
      // Le libellé n'est PAS stocké : seulement de quoi le rendre côté client.
      actorName: null,
      subjectLabel: "Cycle notifications",
      readAt: null,
    });
    expect(list.find((n) => n.type === "INVOICE_ISSUED")).toMatchObject({
      entityType: "INVOICE",
      actorName: null,
      subjectLabel: null,
      readAt: null,
    });
  });

  /**
   * Depuis #146, la boîte du coach n'est plus VIDE : l'acceptation de son invitation s'y range.
   * L'assertion porte donc sur ce qu'elle a toujours voulu dire — rien de ce que le coach a
   * lui-même émis — plutôt que sur un total qui ne mesurait cela que par accident.
   */
  it("l'émetteur n'est pas destinataire : le coach n'a rien reçu de sa propre diffusion", async () => {
    const list = await inbox(coachA);
    expect(list.filter((n) => n.type.startsWith("PLAN_"))).toEqual([]);
    expect(list.filter((n) => n.type === "INVOICE_ISSUED")).toEqual([]);
  });

  it("ajuster une séance diffusée notifie l'athlète, avec le titre de la séance", async () => {
    const adjusted = await putAtLatest(coachA, `/scheduled-sessions/${sessionId}`, {
      title: "Séance ajustée",
      notes: null,
      scheduledDate: monday,
      exercises: [],
    });
    expect(adjusted.status).toBe(200);

    expect(await find(athleteA1, "PLAN_UPDATED")).toMatchObject({
      entityType: "PLAN",
      entityId: planId,
      actorName: null,
      subjectLabel: "Séance ajustée",
    });
  });

  // Ajouter et retirer sont des ajustements au même titre que modifier (CDC §5.7) — et ils ont
  // leur propre type : annoncer « séance modifiée » sur une suppression enverrait l'athlète
  // chercher une séance qui n'existe plus.
  it("ajouter puis retirer une séance d'un cycle diffusé notifie l'athlète", async () => {
    const added = await coachA
      .post(`/plan-weeks/${planWeekId}/sessions`)
      .send({ title: "Séance du jeudi", scheduledDate: monday });
    expect(added.status).toBe(201);

    expect(await find(athleteA1, "PLAN_SESSION_ADDED")).toMatchObject({
      entityType: "PLAN",
      entityId: planId,
      actorName: null,
      subjectLabel: "Séance du jeudi",
      readAt: null,
    });

    expect((await deleteAtLatest(coachA, `/scheduled-sessions/${added.body.id}`)).status).toBe(204);

    // Le titre est la seule trace qu'il reste de la séance : la ligne, elle, a disparu en base.
    expect(await find(athleteA1, "PLAN_SESSION_REMOVED")).toMatchObject({
      entityType: "PLAN",
      entityId: planId,
      subjectLabel: "Séance du jeudi",
    });
  });

  // Le pendant indispensable : sur un BROUILLON, il n'y a rien à annoncer — le cycle n'existe pas
  // encore pour l'athlète, le prévenir de chaque séance posée serait du bruit pur.
  it("composer un cycle en brouillon ne notifie personne", async () => {
    const draft = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle en préparation",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(draft.status).toBe(201);

    const before = (await inbox(athleteA1)).length;
    const session = await coachA
      .post(`/plan-weeks/${draft.body.weeks[0].id}/sessions`)
      .send({ title: "Séance brouillon", scheduledDate: monday });
    expect(session.status).toBe(201);
    expect((await deleteAtLatest(coachA, `/scheduled-sessions/${session.body.id}`)).status).toBe(
      204,
    );

    expect(await inbox(athleteA1)).toHaveLength(before);
  });

  // LE cas que la persistance rattrape : sans appareil enregistré, le push n'a rien à livrer et
  // l'événement était perdu. C'est la situation normale d'un coach qui travaille sur le web.
  it("un débrief atteint un coach SANS appareil enregistré", async () => {
    const feedback = await athleteA1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Bonne séance" });
    expect(feedback.status).toBe(200);

    expect(await find(coachA, "FEEDBACK_RECEIVED")).toMatchObject({
      entityType: "SCHEDULED_SESSION",
      entityId: sessionId,
      actorName: ATHLETE_A1, // un coach suit N athlètes : sans le nom, l'entrée serait opaque
      subjectLabel: "Séance ajustée",
      readAt: null,
    });
  });

  it("un message notifie le destinataire, avec le nom de l'expéditeur", async () => {
    const conversation = await coachA.post("/conversations").send({ athleteId: a1Id });
    conversationId = conversation.body.id;

    const sent = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "On se voit jeudi ?" });
    expect(sent.status).toBe(201);

    expect(await find(athleteA1, "MESSAGE_RECEIVED")).toMatchObject({
      entityType: "CONVERSATION",
      entityId: conversationId,
      actorName: COACH_A,
      subjectLabel: null,
    });
  });

  // La trace garde son throttle (N-3) quand le push n'en a plus (#537) : elle part au passage
  // « tout lu » → « non lu », donc une rafale de messages ne produit qu'UNE entrée tant que rien
  // n'est lu. Le push, absent des e2e (aucun appareil), est éprouvé par `message.service.test.ts`.
  it("une rafale de messages ne produit qu'une seule entrée", async () => {
    const before = (await inbox(athleteA1)).filter((n) => n.type === "MESSAGE_RECEIVED").length;
    for (const content of ["et vendredi ?", "ou samedi"]) {
      await coachA
        .post(`/conversations/${conversationId}/messages`)
        .send({ type: "TEXT", content });
    }
    const after = (await inbox(athleteA1)).filter((n) => n.type === "MESSAGE_RECEIVED").length;
    expect(after).toBe(before);
  });

  // Le revers du throttle (#305) : un fil LU le réarme. Sans ça, un seul non-lu resté en base
  // éteindrait push et e-mail de ce fil pour de bon.
  it("lire le fil rouvre la notification du message suivant", async () => {
    const count = async () =>
      (await inbox(athleteA1)).filter((n) => n.type === "MESSAGE_RECEIVED").length;
    const before = await count();

    expect((await athleteA1.post(`/conversations/${conversationId}/read`)).status).toBe(204);
    await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "finalement dimanche" });

    expect(await count()).toBe(before + 1);
  });

  /**
   * Le bug de #539 : l'avis de débrief, posé au nom de l'athlète, reste non lu chez un coach qui ne
   * passe que par la page Débriefs. Il comptait comme un message de l'athlète, et tout ce que
   * celui-ci écrivait ensuite restait muet — ni push, ni e-mail, ni entrée au centre.
   */
  it("un avis de débrief non lu n'éteint pas le message suivant de l'athlète", async () => {
    const thread = await coachA.get(`/conversations/${conversationId}/messages`);
    const pending = thread.body.filter(
      (m: { type: string; readAt: string | null }) =>
        m.type === "FEEDBACK_CREATED" && m.readAt === null,
    );
    expect(pending).toHaveLength(1);
    const count = async () =>
      (await inbox(coachA)).filter((n) => n.type === "MESSAGE_RECEIVED").length;
    const before = await count();

    const sent = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Débrief posté, tu me dis ?" });
    expect(sent.status).toBe(201);

    expect(await count()).toBe(before + 1);
  });

  it("le compteur ne compte que les non lues", async () => {
    const list = await inbox(athleteA1);
    expect(await unread(athleteA1)).toBe(list.length);

    const first = required(list[0], "notification à marquer lue");
    const read = await athleteA1.patch(`/me/notifications/${first.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.readAt).not.toBeNull();
    expect(await unread(athleteA1)).toBe(list.length - 1);
  });

  it("relire une notification déjà lue ne la redate pas", async () => {
    const alreadyRead = (await inbox(athleteA1)).find((n) => n.readAt != null);
    expect(alreadyRead).toBeDefined();

    const again = await athleteA1.patch(`/me/notifications/${alreadyRead?.id}/read`);
    expect(again.status).toBe(200);
    expect(again.body.readAt).toBe(alreadyRead?.readAt);
  });

  it("marquer lue la notification d'un autre est un 404 (le scope ne la voit pas)", async () => {
    const target = required((await inbox(coachA))[0], "notification du coach A");

    expect((await athleteA1.patch(`/me/notifications/${target.id}/read`)).status).toBe(404);
    expect((await coachB.patch(`/me/notifications/${target.id}/read`)).status).toBe(404);
    // Et elle est restée non lue chez son destinataire.
    expect(required((await inbox(coachA))[0], "notification du coach A").readAt).toBeNull();
  });

  it("« tout marquer comme lu » vide le badge sans rien supprimer", async () => {
    const total = (await inbox(athleteA1)).length;
    expect(await unread(athleteA1)).toBeGreaterThan(0);

    const res = await athleteA1.post("/me/notifications/read-all");
    expect(res.status).toBe(204);
    expect(await unread(athleteA1)).toBe(0);
    expect(await inbox(athleteA1)).toHaveLength(total);
  });

  it("isolation : un tiers ne voit aucune notification des autres", async () => {
    // L'athlète B a UNE entrée : l'invitation de son propre coach, qui visait son adresse (#390).
    expect((await inbox(athleteB1)).map((n) => n.type)).toEqual(["INVITATION_RECEIVED"]);
    expect(await unread(athleteB1)).toBe(1);
    // Le coach B a UNE entrée, et une seule : son propre athlète l'a rejoint (#146). Rien de ce
    // qui s'est passé chez A — c'est bien l'isolation qu'on mesure, pas une boîte vide.
    expect((await inbox(coachB)).map((n) => n.type)).toEqual(["INVITATION_ACCEPTED"]);
  });
});

describe("Compteur de notifications ventilé par espace (#176)", () => {
  const monday = mondayOfCurrentWeek();

  /**
   * Un compte à double capacité reçoit des deux côtés : un cycle diffusé par SON coach (athlète)
   * et un débrief écrit par SON athlète (coach). Le total ne dit pas où — la ventilation, si.
   * Sans elle, le basculeur d'espace ne peut pas signaler l'univers qu'on ne regarde pas.
   */
  it("range chaque notification dans l'espace où elle se lit", async () => {
    const myCoach = await signUpWith("vent-coach@cmv.test", { isCoach: true, isAthlete: false });
    const dual = await signUpWith("vent-dual@cmv.test", { isCoach: true, isAthlete: true });
    const myAthlete = await signUpWith("vent-athlete@cmv.test", {
      isCoach: false,
      isAthlete: true,
    });

    // `dual` est l'athlète de `myCoach`…
    const toDual = await inviteFor(myCoach, dual);
    const dualId = (await dual.post(`/invitations/${toDual.body.id}/accept`)).body[0].athleteId;
    // … et le coach de `myAthlete`.
    const toAthlete = await inviteFor(dual, myAthlete);
    const athleteId = (await myAthlete.post(`/invitations/${toAthlete.body.id}/accept`)).body[0]
      .athleteId;

    // Côté ATHLÈTE : son coach lui diffuse un cycle (cycle + facture émise = 2 entrées).
    const received = await myCoach.post("/plans").send({
      athleteId: dualId,
      title: "Cycle reçu",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect((await billAndPublish(myCoach, received.body.id)).status).toBe(200);

    // Côté COACH : son athlète lui écrit un débrief.
    const exercise = await dual.post("/exercises").send({ title: "Gainage" });
    const template = await dual
      .post("/sessions")
      .send({ title: "Séance suivie", exercises: [{ exerciseId: exercise.body.id }] });
    const plan = await dual.post("/plans").send({
      athleteId,
      title: "Cycle donné",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const scheduled = await dual
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: monday });
    expect((await billAndPublish(dual, plan.body.id)).status).toBe(200);
    expect(
      (
        await myAthlete
          .put(`/me/scheduled-sessions/${scheduled.body.id}/feedback`)
          .send({ content: "Fait" })
      ).status,
    ).toBe(200);

    const unread = await dual.get("/me/notifications/unread-count");
    expect(unread.status).toBe(200);
    // Reçu en athlète : l'invitation de `myCoach` (#390), le cycle diffusé, la facture émise. Reçu
    // en coach : `myAthlete` qui l'a rejoint (#146), puis son débrief. Les cinq se rangent des
    // deux côtés sans se mélanger.
    expect(unread.body.athlete).toBe(3);
    expect(unread.body.coach).toBe(2);
    expect(unread.body.count).toBe(5);
  });

  /**
   * Le seul chemin qui interroge VRAIMENT `Conversation` pour ventiler : il faut un compte à double
   * capacité ET au moins un message non lu. Sans message, `unreadMessagesByCapability` sort avant
   * d'y toucher — c'est exactement le trou par lequel un 500 est passé en production de dev.
   */
  it("ventile les messages non lus d'un compte à double capacité", async () => {
    const dual = await signUpWith("vent-msg-dual@cmv.test", { isCoach: true, isAthlete: true });
    const myAthlete = await signUp("vent-msg-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(dual, myAthlete);
    const accepted = await myAthlete.post(`/invitations/${invitation.body.id}/accept`);
    expect(accepted.status).toBe(201);

    // L'athlète écrit à son coach : le coach (donc `dual`) reçoit un MESSAGE_RECEIVED non lu.
    const thread = await myAthlete
      .post("/conversations")
      .send({ coachId: accepted.body[0].coachId });
    expect(thread.status).toBe(201);
    expect(
      (
        await myAthlete
          .post(`/conversations/${thread.body.id}/messages`)
          .send({ type: "TEXT", content: "Une question sur la séance" })
      ).status,
    ).toBe(201);

    const unread = await dual.get("/me/notifications/unread-count");
    expect(unread.status).toBe(200);
    // Le message tombe du côté COACH : c'est là que `dual` tient ce fil. Il s'ajoute à l'athlète
    // qui vient de le rejoindre (#146), reçu du même côté — rien ne passe côté athlète.
    expect(unread.body).toMatchObject({ coach: 2, athlete: 0, count: 2 });
  });

  // Un compte mono-capacité voit tout d'un seul côté : la ventilation ne lui coûte rien et ne
  // change pas son total, que la cloche lit toujours.
  it("range tout du seul côté d'un compte mono-capacité", async () => {
    const coach = await signUpWith("vent-solo-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const athlete = await signUp("vent-solo-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    const id = accepted.body[0].athleteId;

    const plan = await coach.post("/plans").send({
      athleteId: id,
      title: "Cycle simple",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);

    // L'invitation reçue (#390), le cycle, la facture : tout côté athlète.
    const unread = await athlete.get("/me/notifications/unread-count");
    expect(unread.body).toMatchObject({ coach: 0, athlete: 3, count: 3 });

    // Et l'autre moitié : un message reçu par un coach SANS capacité athlète reste côté coach,
    // sans qu'on ait à demander aux fils de quel côté il le tient.
    const thread = await athlete.post("/conversations").send({ coachId: accepted.body[0].coachId });
    expect(
      (
        await athlete
          .post(`/conversations/${thread.body.id}/messages`)
          .send({ type: "TEXT", content: "Reçu, merci" })
      ).status,
    ).toBe(201);
    // L'athlète qui l'a rejoint (#146), puis son message.
    const coachUnread = await coach.get("/me/notifications/unread-count");
    expect(coachUnread.body).toMatchObject({ coach: 2, athlete: 0, count: 2 });
  });
});

describe("Notifications par e-mail : opt-in, isolation et envoi (#65)", () => {
  let coach: Agent;
  let athlete: Agent;
  let otherAthlete: Agent;
  let athleteId: string;

  const monday = mondayOfCurrentWeek();
  const COACH = "mail-coach@cmv.test";
  const ATHLETE = "mail-athlete@cmv.test";
  const OTHER = "mail-other@cmv.test";

  type Preference = { type: string; enabled: boolean };

  const preferences = async (agent: Agent): Promise<Preference[]> =>
    (await agent.get("/me/notification-preferences")).body;
  const enabledOf = (grid: Preference[]): string[] =>
    grid.filter((row) => row.enabled).map((row) => row.type);

  /** Un cycle prêt à diffuser, avec sa semaine — la diffusion émet cycle PUIS facture. */
  async function draftPlan(title: string): Promise<string> {
    const plan = await coach.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    return plan.body.id;
  }

  beforeAll(async () => {
    coach = await signUp(COACH, Role.COACH);
    athlete = await signUp(ATHLETE, Role.ATHLETE);
    otherAthlete = await signUp(OTHER, Role.ATHLETE);

    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    athleteId = accepted.body[0].athleteId;
  });

  beforeEach(() => {
    sentMails.length = 0;
  });

  it("ne propose que les types envoyables, tous éteints par défaut", async () => {
    const grid = await preferences(athlete);

    expect(grid.map((row) => row.type)).toEqual([...EMAILABLE_NOTIFICATION_TYPES]);
    // L'opt-in EST le comportement par défaut : un compte qui n'a jamais rien réglé ne reçoit rien.
    expect(enabledOf(grid)).toEqual([]);
  });

  it("remplace l'ensemble activé et le relit à l'identique", async () => {
    const put = await athlete
      .put("/me/notification-preferences")
      .send({ enabled: ["PLAN_PUBLISHED", "MESSAGE_RECEIVED"] });

    expect(put.status).toBe(200);
    expect(enabledOf(put.body).sort()).toEqual(["MESSAGE_RECEIVED", "PLAN_PUBLISHED"]);
    expect(enabledOf(await preferences(athlete)).sort()).toEqual([
      "MESSAGE_RECEIVED",
      "PLAN_PUBLISHED",
    ]);
  });

  // Le geste « je coupe tout » : c'est un `notIn: []` côté Prisma, qui supprime bien tout.
  it("coupe tout sur une liste vide", async () => {
    await athlete.put("/me/notification-preferences").send({ enabled: ["PLAN_PUBLISHED"] });

    const put = await athlete.put("/me/notification-preferences").send({ enabled: [] });

    expect(put.status).toBe(200);
    expect(enabledOf(put.body)).toEqual([]);
    expect(enabledOf(await preferences(athlete))).toEqual([]);
  });

  /**
   * Le refus vient du SCHÉMA, avant toute écriture. Les trois ajustements de cycle arrivent par
   * rafales et rien ne les groupe (dette N-6) : les autoriser mettrait trois e-mails dans une
   * boîte pour trois séances ajoutées au même cycle.
   */
  it("refuse un type que le produit n'envoie pas par e-mail", async () => {
    const put = await athlete
      .put("/me/notification-preferences")
      .send({ enabled: ["PLAN_SESSION_ADDED"] });

    expect(put.status).toBe(400);
    expect(enabledOf(await preferences(athlete))).toEqual([]);
  });

  it("les réglages d'un compte sont invisibles et intacts pour un autre", async () => {
    await athlete.put("/me/notification-preferences").send({ enabled: ["PLAN_PUBLISHED"] });

    expect(enabledOf(await preferences(otherAthlete))).toEqual([]);
    expect(enabledOf(await preferences(coach))).toEqual([]);
    // Et l'écriture du voisin ne défait pas la sienne.
    await otherAthlete.put("/me/notification-preferences").send({ enabled: [] });
    expect(enabledOf(await preferences(athlete))).toEqual(["PLAN_PUBLISHED"]);
  });

  it("un compte non authentifié n'atteint ni la lecture ni l'écriture", async () => {
    const anonymous = request.agent(baseURL);
    expect((await anonymous.get("/me/notification-preferences")).status).toBe(401);
    expect((await anonymous.put("/me/notification-preferences").send({ enabled: [] })).status).toBe(
      401,
    );
  });

  // Le cœur de l'opt-in : sans réglage, la diffusion notifie et pousse, mais n'écrit à personne.
  it("préférence à off : la diffusion n'envoie AUCUN e-mail", async () => {
    await athlete.put("/me/notification-preferences").send({ enabled: [] });
    const planId = await draftPlan("Cycle sans e-mail");

    expect((await billAndPublish(coach, planId)).status).toBe(200);

    expect(sentMails).toEqual([]);
    // La trace persistée, elle, existe bien : l'e-mail est un canal de plus, pas à la place.
    expect((await athlete.get("/me/notifications")).body.length).toBeGreaterThan(0);
  });

  /**
   * Préférence à on, et sur UN SEUL type. La diffusion émet deux notifications — cycle puis
   * facture : un seul e-mail doit partir. C'est ce qui prouve que le filtre est par type et non
   * un simple interrupteur global.
   */
  it("préférence à on : un e-mail part, et seulement pour le type activé", async () => {
    await athlete.put("/me/notification-preferences").send({ enabled: ["PLAN_PUBLISHED"] });
    const planId = await draftPlan("Cycle avec e-mail");

    expect((await billAndPublish(coach, planId)).status).toBe(200);

    expect(sentMails).toHaveLength(1);
    const mail = required(sentMails[0], "e-mail de diffusion");
    expect(mail.to).toBe(ATHLETE);
    expect(mail.subject).toContain("Cycle avec e-mail");
    // Le corps texte accompagne toujours le HTML : sans lui, plus de messages sont classés
    // indésirables, et certains clients n'affichent rien.
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.html).toContain("</html>");
  });

  /**
   * L'émetteur n'est jamais son propre destinataire (#14). La garde vit dans `emit`, donc
   * l'e-mail en hérite — mais rien ne le dit au lecteur du code de l'e-mail, d'où ce test.
   */
  it("un coach qui se coache lui-même ne s'écrit pas", async () => {
    const solo = await signUpWith("mail-solo@cmv.test", { isCoach: true, isAthlete: true });
    const self = await solo.get("/athletes");
    const selfId = required(
      self.body.find((row: { isSelf: boolean }) => row.isSelf),
      "relation d'auto-coaching",
    ).athleteId;
    await solo.put("/me/notification-preferences").send({ enabled: ["PLAN_PUBLISHED"] });

    const plan = await solo.post("/plans").send({
      athleteId: selfId,
      title: "Cycle pour moi",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect((await publishAtLatest(solo, plan.body.id)).status).toBe(200);

    expect(sentMails).toEqual([]);
  });
});
