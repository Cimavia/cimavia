import { InvitationStatus, Locale, Role } from "@cmv/shared";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import {
  type Agent,
  billAndPublish,
  inviteFor,
  linkRelation,
  PASSWORD,
  required,
  signUp,
  signUpWith,
} from "../support/actors";
import { app, baseURL, sentMails } from "../support/app";
import { mondayOfCurrentWeek } from "../support/fixtures";

/**
 * Mot de passe oublié, de bout en bout : la demande, l'e-mail dans la langue du compte, le lien,
 * le nouveau mot de passe. Le seul parcours où l'on entre SANS session — et où une régression
 * enferme l'utilisateur dehors sans qu'aucun écran ne le signale.
 */
describe("Réinitialisation du mot de passe", () => {
  const EMAIL = "reset@cmv.test";
  const NEW_PASSWORD = "nouveau-mot-de-passe";

  beforeAll(async () => {
    const agent = await signUp(EMAIL, Role.ATHLETE);
    // Le compte lit en anglais : l'e-mail doit suivre, pas la langue par défaut.
    await agent.post("/api/auth/update-user").send({ locale: Locale.EN });
  });

  it("envoie le lien dans la langue du compte, puis accepte le nouveau mot de passe", async () => {
    sentMails.length = 0;

    const requested = await request(baseURL)
      .post("/api/auth/request-password-reset")
      .send({ email: EMAIL, redirectTo: "http://localhost:5173/reset-password" });
    expect(requested.status).toBe(200);

    const mail = required(sentMails[0], "e-mail de réinitialisation");
    expect(mail).toMatchObject({ to: EMAIL, subject: "Reset your Cimavia password" });
    const token = required(/reset-password\/([^?"\s]+)/.exec(mail.text)?.[1], "jeton du lien");

    const reset = await request(baseURL)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    const signIn = (password: string) =>
      request(baseURL).post("/api/auth/sign-in/email").send({ email: EMAIL, password });
    expect((await signIn(NEW_PASSWORD)).status).toBe(200);
    expect((await signIn(PASSWORD)).status).toBe(401);
  });

  // Répondre différemment dirait qui a un compte : la demande réussit, et rien ne part.
  it("ne révèle pas qu'une adresse est inconnue, et n'envoie rien", async () => {
    sentMails.length = 0;

    const res = await request(baseURL)
      .post("/api/auth/request-password-reset")
      .send({ email: "personne@cmv.test", redirectTo: "http://localhost:5173/reset-password" });

    expect(res.status).toBe(200);
    expect(sentMails).toEqual([]);
  });
});

describe("Plusieurs coachs par athlète (#599)", () => {
  let coachC: Agent;
  let coachM: Agent;
  let athlete: Agent;
  let cId: string;
  let mId: string;
  let tiId: string;
  let fromC: { planId: string; sessionId: string };
  let fromM: { planId: string; sessionId: string };

  const monday = mondayOfCurrentWeek();

  // Un cycle d'une semaine, une séance au lundi, facturé et diffusé : de quoi lire de chaque côté.
  async function publishedCycle(coach: Agent, title: string) {
    const template = await coach.post("/sessions").send({ title, notes: null, exercises: [] });
    const plan = await coach.post("/plans").send({
      athleteId: tiId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    const scheduled = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: monday });
    expect(scheduled.status).toBe(201);
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);
    return { planId: plan.body.id as string, sessionId: scheduled.body.id as string };
  }

  beforeAll(async () => {
    coachC = await signUp("multi-coach-c@cmv.test", Role.COACH);
    coachM = await signUp("multi-coach-m@cmv.test", Role.COACH);
    athlete = await signUp("multi-athlete-ti@cmv.test", Role.ATHLETE);

    const withC = await linkRelation(coachC, athlete);
    const withM = await linkRelation(coachM, athlete);
    cId = withC.coachId;
    mId = withM.coachId;
    tiId = withC.athleteId;

    fromC = await publishedCycle(coachC, "Cycle de C");
    fromM = await publishedCycle(coachM, "Cycle de M");
  });

  it("l'athlète voit ses deux coachs, et chaque coach le voit parmi ses athlètes", async () => {
    const coaches = await athlete.get("/me/coaches");
    expect(coaches.status).toBe(200);
    expect(coaches.body.map((relation: { coachId: string }) => relation.coachId).sort()).toEqual(
      [cId, mId].sort(),
    );
    expect(
      coaches.body.map((relation: { coachName: string }) => relation.coachName).sort(),
    ).toEqual(["multi-coach-c@cmv.test", "multi-coach-m@cmv.test"]);

    for (const coach of [coachC, coachM]) {
      const athletes = await coach.get("/athletes");
      expect(athletes.body.map((relation: { athleteId: string }) => relation.athleteId)).toEqual([
        tiId,
      ]);
    }
  });

  it("un athlète autonome n'a aucun coach — une liste vide, pas une erreur", async () => {
    const autonome = await signUp("multi-autonome@cmv.test", Role.ATHLETE);
    const res = await autonome.get("/me/coaches");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("la liste des coachs reste fermée au titre de coach", async () => {
    expect((await coachC.get("/me/coaches")).status).toBe(403);
  });

  it("l'athlète reçoit les cycles des deux, chacun nommant son coach", async () => {
    const plans = await athlete.get("/me/plans");
    expect(plans.status).toBe(200);
    const byId = new Map(
      plans.body.map((plan: { id: string; coachName: string }) => [plan.id, plan.coachName]),
    );
    expect(byId.get(fromC.planId)).toBe("multi-coach-c@cmv.test");
    expect(byId.get(fromM.planId)).toBe("multi-coach-m@cmv.test");
    expect(byId.size).toBe(2);

    const session = await athlete.get(`/me/scheduled-sessions/${fromM.sessionId}`);
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({ coachId: mId, coachName: "multi-coach-m@cmv.test" });
  });

  it("aucun des deux coachs ne voit le cycle ni la séance de l'autre", async () => {
    expect((await coachC.get("/plans")).body.map((plan: { id: string }) => plan.id)).toEqual([
      fromC.planId,
    ]);
    expect((await coachC.get(`/plans/${fromM.planId}`)).status).toBe(404);
    expect((await coachM.get(`/plans/${fromC.planId}`)).status).toBe(404);
    expect((await coachC.get(`/scheduled-sessions/${fromM.sessionId}`)).status).toBe(404);
  });

  it("l'athlète reçoit les deux factures ; chaque coach ne voit que la sienne", async () => {
    const invoices = await athlete.get("/invoices");
    expect(invoices.body.map((invoice: { coachId: string }) => invoice.coachId).sort()).toEqual(
      [cId, mId].sort(),
    );

    const ofC = await coachC.get("/invoices");
    expect(ofC.body.map((invoice: { planId: string }) => invoice.planId)).toEqual([fromC.planId]);
    const ofM = await coachM.get("/invoices");
    expect(ofM.body.map((invoice: { planId: string }) => invoice.planId)).toEqual([fromM.planId]);
  });

  it("l'athlète ouvre un fil avec chacun de ses coachs, et ce sont deux fils", async () => {
    const withC = await athlete.post("/conversations").send({ coachId: cId });
    const withM = await athlete.post("/conversations").send({ coachId: mId });
    expect(withC.status).toBe(201);
    expect(withM.status).toBe(201);
    expect(withC.body.counterpartId).toBe(cId);
    expect(withM.body.counterpartId).toBe(mId);
    expect(withC.body.id).not.toBe(withM.body.id);

    // Le MÊME fil que celui que le coach ouvre de son côté.
    const fromCoach = await coachM.post("/conversations").send({ athleteId: tiId });
    expect(fromCoach.body.id).toBe(withM.body.id);
  });

  it("refuse un fil avec un coach qui ne le suit pas, ou avec soi-même", async () => {
    const stranger = await signUp("multi-coach-stranger@cmv.test", Role.COACH);
    const strangerId = (await stranger.get("/api/auth/get-session")).body.user.id;

    const foreign = await athlete.post("/conversations").send({ coachId: strangerId });
    expect(foreign.status).toBe(400);
    expect(foreign.body.message).toBe("Coach inconnu");

    const self = await athlete.post("/conversations").send({ coachId: tiId });
    expect(self.status).toBe(409);
  });

  it("aucun coach ne lit le fil de l'autre — un débrief va au fil du coach de la séance", async () => {
    const withC = await athlete.post("/conversations").send({ coachId: cId });
    const sent = await athlete
      .post(`/conversations/${withC.body.id}/messages`)
      .send({ type: "TEXT", content: "Pour C seulement" });
    expect(sent.status).toBe(201);

    // M débriefé : l'avis tombe dans le fil (M, TI), pas dans celui de C.
    const feedback = await athlete
      .put(`/me/scheduled-sessions/${fromM.sessionId}/feedback`)
      .send({ content: "Séance de M faite" });
    expect(feedback.status).toBe(200);

    expect((await coachM.get(`/conversations/${withC.body.id}/messages`)).status).toBe(404);
    const threadsOfM = await coachM.get("/conversations");
    expect(
      threadsOfM.body.map((thread: { counterpartId: string }) => thread.counterpartId),
    ).toEqual([tiId]);
    const withM = required(threadsOfM.body[0], "fil de M") as { id: string };
    const messagesOfM = await coachM.get(`/conversations/${withM.id}/messages`);
    expect(
      messagesOfM.body.map((message: { content: string | null }) => message.content),
    ).not.toContain("Pour C seulement");

    const messagesOfC = await coachC.get(`/conversations/${withC.body.id}/messages`);
    expect(messagesOfC.body.map((message: { type: string }) => message.type)).toEqual(["TEXT"]);
  });
});

describe("Anti-cycle et anti-self sur la relation coach↔athlète (#11)", () => {
  /**
   * Chaîne A → B → C : chacun coache le suivant. Elle n'est possible que parce que B et C portent
   * les DEUX capacités — être coaché n'empêche pas de coacher. C'est exactement le modèle que #7
   * ouvre, et le seul contexte où une boucle devient concevable.
   */
  async function chain(prefix: string, depth: number): Promise<{ agents: Agent[]; ids: string[] }> {
    const agents: Agent[] = [];
    const ids: string[] = [];
    for (let i = 0; i < depth; i++) {
      const email = `${prefix}-${i}@cmv.test`;
      // TOUS cumulent, y compris le premier maillon : les tests de boucle lui font accepter une
      // invitation, et sans la capacité athlète il prendrait un 403 de garde — pas le 409
      // anti-cycle que ces tests prétendent vérifier.
      agents.push(await signUpWith(email, { isCoach: true, isAthlete: true }));
    }
    for (let i = 0; i + 1 < depth; i++) {
      const coach = required(agents[i], `coach ${i}`);
      const athlete = required(agents[i + 1], `athlète ${i + 1}`);
      const invitation = await inviteFor(coach, athlete);
      const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
      expect(accepted.status).toBe(201);
      ids.push(accepted.body[0].coachId);
      if (i + 2 === depth) ids.push(accepted.body[0].athleteId);
    }
    return { agents, ids };
  }

  /**
   * Le test qui donne sa valeur aux autres : une chaîne de profondeur 3 doit se CONSTRUIRE. Sans
   * lui, une garde qui refuserait tout passerait les refus ci-dessous sans qu'on le voie.
   */
  it("laisse se construire une chaîne A → B → C", async () => {
    const { ids } = await chain("cycle-ok", 3);
    expect(new Set(ids).size).toBe(3);
  });

  // Le cas de l'issue : C invite A, qui est déjà sa racine. La remontée depuis C traverse B.
  it("refuse la boucle qui reviendrait au premier coach (profondeur 3)", async () => {
    const { agents } = await chain("cycle-deep", 3);
    const c = required(agents[2], "maillon C");
    const a = required(agents[0], "maillon A");

    const invitation = await inviteFor(c, a);
    const res = await a.post(`/invitations/${invitation.body.id}/accept`);

    expect(res.status).toBe(409);
  });

  // La boucle la plus courte : B coache A alors que A coache déjà B.
  it("refuse la boucle immédiate entre deux comptes", async () => {
    const { agents } = await chain("cycle-pair", 2);
    const b = required(agents[1], "maillon B");
    const a = required(agents[0], "maillon A");

    const invitation = await inviteFor(b, a);
    const res = await a.post(`/invitations/${invitation.body.id}/accept`);

    expect(res.status).toBe(409);
  });

  /**
   * Le losange (#599) : A suivi par B et C, tous deux suivis par D. La remontée depuis A atteint D
   * deux fois sans aucune boucle — l'ensemble de visités de #11 y aurait vu un cycle et répondu
   * 500 à une invitation valide.
   */
  it("laisse un tiers rejoindre le bas d'un losange de coachs", async () => {
    const both = { isCoach: true, isAthlete: true };
    const d = await signUpWith("cycle-diamond-d@cmv.test", both);
    const b = await signUpWith("cycle-diamond-b@cmv.test", both);
    const c = await signUpWith("cycle-diamond-c@cmv.test", both);
    const a = await signUpWith("cycle-diamond-a@cmv.test", both);
    await linkRelation(d, b);
    await linkRelation(d, c);
    await linkRelation(b, a);
    await linkRelation(c, a);
    const outsider = await signUp("cycle-diamond-outsider@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(a, outsider);
    expect((await outsider.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);
  });

  // Deux coachs ne cachent pas la boucle : elle remonte par l'un d'eux, pas par l'autre.
  it("refuse la boucle qui remonterait par l'un de deux coachs", async () => {
    const both = { isCoach: true, isAthlete: true };
    const top = await signUpWith("cycle-branch-top@cmv.test", both);
    const left = await signUpWith("cycle-branch-left@cmv.test", both);
    const right = await signUpWith("cycle-branch-right@cmv.test", both);
    const bottom = await signUpWith("cycle-branch-bottom@cmv.test", both);
    await linkRelation(top, left);
    await linkRelation(right, bottom);
    await linkRelation(left, bottom);

    const invitation = await inviteFor(bottom, top);
    expect((await top.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(409);
  });

  /**
   * Anti-self. Inatteignable avant #9/#10 : accepter exige la capacité athlète, qu'un coach
   * n'avait pas. Un compte qui cumule peut désormais présenter son propre code.
   */
  it("refuse à un compte à double capacité d'accepter sa propre invitation", async () => {
    const self = await signUpWith("cycle-self@cmv.test", { isCoach: true, isAthlete: true });

    const invitation = await inviteFor(self, self);
    const res = await self.post(`/invitations/${invitation.body.id}/accept`);

    expect(res.status).toBe(409);
  });

  /**
   * La base contient DÉJÀ une boucle (écriture manuelle, futur chemin qui oublierait la garde). La
   * remontée ne doit pas tourner indéfiniment : elle lève, et rien n'est créé. Ce n'est pas un 409
   * — l'athlète n'y est pour rien, c'est une incohérence de données, qui doit se voir comme telle.
   */
  it("lève au lieu de boucler sur un cycle déjà présent en base, sans rien créer", async () => {
    const { agents, ids } = await chain("cycle-corrupt", 3);
    const [aId, , cId] = ids;
    const b = required(agents[1], "maillon B");
    const prisma = app.get(PrismaService);
    // C coache A : la chaîne A → B → C se referme, ce qu'aucune route ne sait produire.
    const corrupt = await prisma.coachAthlete.create({
      data: {
        coachId: required(cId, "maillon C"),
        athleteId: required(aId, "maillon A"),
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    const outsider = await signUpWith("cycle-corrupt-outsider@cmv.test", {
      isCoach: false,
      isAthlete: true,
    });

    try {
      // La remontée depuis B : A, puis C, puis B de nouveau — sans jamais croiser l'invité.
      const invitation = await inviteFor(b, outsider);
      const res = await outsider.post(`/invitations/${invitation.body.id}/accept`);

      expect(res.status).toBe(500);
      expect((await outsider.get("/me/coaches")).body).toEqual([]);
    } finally {
      await prisma.coachAthlete.delete({ where: { id: corrupt.id } });
    }
  });

  /**
   * Deux chaînes distinctes ne se gênent pas : le refus porte sur la BOUCLE, pas sur le fait
   * d'être déjà coaché ailleurs — ça, c'est l'unicité `athleteId`, qui a son propre test.
   */
  it("laisse un compte déjà coach devenir l'athlète d'une autre chaîne", async () => {
    const { agents } = await chain("cycle-join", 2);
    const outsider = await signUp("cycle-outsider@cmv.test", Role.COACH);
    const a = required(agents[0], "maillon A");

    const invitation = await inviteFor(outsider, a);
    const res = await a.post(`/invitations/${invitation.body.id}/accept`);

    expect(res.status).toBe(201);
  });
});

describe("Capacités modifiables après coup (#13)", () => {
  async function capabilitiesOfSession(agent: Agent) {
    const session = await agent.get("/api/auth/get-session");
    const { isCoach, isAthlete, role } = session.body.user;
    return { isCoach, isAthlete, role };
  }

  it("un athlète peut se mettre à coacher", async () => {
    const agent = await signUp("cap-add@cmv.test", Role.ATHLETE);
    const res = await agent.patch("/me/capabilities").send({ isCoach: true, isAthlete: true });

    expect(res.status).toBe(200);
    expect(await capabilitiesOfSession(agent)).toEqual({
      isCoach: true,
      isAthlete: true,
      // Le persona suit : coach l'emporte quand les deux sont là (#12).
      role: Role.COACH,
    });
  });

  /**
   * Le persona se RECALCULE. Sans ça, un compte `role=COACH` qui cesse de coacher atterrirait dans
   * un espace dont il n'a plus la capacité — nav vide, redirections en boucle.
   */
  it("recalcule le persona quand la capacité coach part", async () => {
    const agent = await signUpWith("cap-persona@cmv.test", { isCoach: true, isAthlete: true });
    expect((await capabilitiesOfSession(agent)).role).toBe(Role.COACH);

    const res = await agent.patch("/me/capabilities").send({ isCoach: false, isAthlete: true });
    expect(res.status).toBe(200);
    expect(await capabilitiesOfSession(agent)).toEqual({
      isCoach: false,
      isAthlete: true,
      role: Role.ATHLETE,
    });
  });

  // La règle du signup, rejouée : un compte sans capacité serait devant une application vide.
  it("refuse de retirer les deux capacités (400)", async () => {
    const agent = await signUp("cap-none@cmv.test", Role.COACH);
    const res = await agent.patch("/me/capabilities").send({ isCoach: false, isAthlete: false });
    expect(res.status).toBe(400);
  });

  it("refuse de cesser de coacher avec des athlètes actifs (409)", async () => {
    const coach = await signUpWith("cap-busy-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("cap-busy-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    expect((await athlete.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);

    const res = await coach.patch("/me/capabilities").send({ isCoach: false, isAthlete: true });
    expect(res.status).toBe(409);
    // La capacité n'a PAS bougé — un refus qui laisserait l'état à moitié écrit serait pire que
    // pas de refus du tout.
    expect((await capabilitiesOfSession(coach)).isCoach).toBe(true);
  });

  it("refuse de cesser d'être athlète en étant rattaché à un coach (409)", async () => {
    const coach = await signUpWith("cap-linked-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const linked = await signUpWith("cap-linked@cmv.test", { isCoach: true, isAthlete: true });
    const invitation = await inviteFor(coach, linked);
    expect((await linked.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);

    const res = await linked.patch("/me/capabilities").send({ isCoach: true, isAthlete: false });
    expect(res.status).toBe(409);
    expect((await capabilitiesOfSession(linked)).isAthlete).toBe(true);
  });

  // Le pendant des deux refus : sans coach, rien ne retient la capacité athlète.
  it("laisse cesser d'être athlète quand aucun coach n'est rattaché", async () => {
    const agent = await signUpWith("cap-drop-athlete@cmv.test", { isCoach: true, isAthlete: true });

    const res = await agent.patch("/me/capabilities").send({ isCoach: true, isAthlete: false });

    expect(res.status).toBe(200);
    expect(await capabilitiesOfSession(agent)).toEqual({
      isCoach: true,
      isAthlete: false,
      role: Role.COACH,
    });
  });

  /**
   * Ce qui n'est PAS bloquant : la donnée produite. Un coach sans athlète garde sa bibliothèque et
   * ses cycles — ils sortent de sa vue, ils ne sont pas supprimés, et ils reviennent s'il réactive.
   * Bloquer là-dessus coincerait quiconque a seulement essayé l'application.
   */
  it("laisse cesser de coacher malgré une bibliothèque existante", async () => {
    const agent = await signUpWith("cap-library@cmv.test", { isCoach: true, isAthlete: true });
    expect((await agent.post("/exercises").send({ title: "Traction" })).status).toBe(201);

    const res = await agent.patch("/me/capabilities").send({ isCoach: false, isAthlete: true });
    expect(res.status).toBe(200);

    // L'exercice n'est plus atteignable — la route exige la capacité coach — mais rien n'a disparu.
    expect((await agent.get("/exercises")).status).toBe(403);
    expect(
      (await agent.patch("/me/capabilities").send({ isCoach: true, isAthlete: true })).status,
    ).toBe(200);
    expect((await agent.get("/exercises")).body).toHaveLength(1);
  });

  /**
   * #314 : une invitation encore en attente lierait l'athlète à un compte qui ne coache plus, et
   * aucune route ne l'en sortirait (#213). Cesser de coacher la retire — la transition de #524 —, et
   * réactiver la capacité ne la ressuscite pas.
   */
  it("retire les invitations en attente de qui cesse de coacher, sans les rendre au retour", async () => {
    const coach = await signUpWith("cap-pending-coach@cmv.test", {
      isCoach: true,
      isAthlete: true,
    });
    const athlete = await signUp("cap-pending-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);

    const res = await coach.patch("/me/capabilities").send({ isCoach: false, isAthlete: true });
    expect(res.status).toBe(200);
    expect((await athlete.get("/invitations/for-me")).body).toEqual([]);

    expect(
      (await coach.patch("/me/capabilities").send({ isCoach: true, isAthlete: true })).status,
    ).toBe(200);
    const late = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    expect({ status: late.status, message: late.body.message }).toEqual({
      status: 410,
      message: "Invitation retirée par le coach",
    });
    expect((await athlete.get("/me/coaches")).body).toEqual([]);
  });

  // Le retrait ne touche que l'attente : une relation nouée reste tracée, un refus reste un refus.
  it("ne touche pas aux invitations qui ne sont plus en attente", async () => {
    const coach = await signUpWith("cap-done-coach@cmv.test", { isCoach: true, isAthlete: true });
    const declining = await signUp("cap-done-declining@cmv.test", Role.ATHLETE);
    const declined = await inviteFor(coach, declining);
    expect((await declining.post(`/invitations/${declined.body.id}/decline`)).status).toBe(204);

    expect(
      (await coach.patch("/me/capabilities").send({ isCoach: false, isAthlete: true })).status,
    ).toBe(200);
    const row = await app.get(PrismaService).invitation.findUniqueOrThrow({
      where: { id: declined.body.id },
    });
    expect(row.status).toBe(InvitationStatus.DECLINED);
  });

  // Ne retirer que la capacité athlète laisse les invitations du coach en l'état.
  it("garde les invitations en attente de qui ne retire que la capacité athlète", async () => {
    const coach = await signUpWith("cap-keep-coach@cmv.test", { isCoach: true, isAthlete: true });
    const athlete = await signUp("cap-keep-athlete@cmv.test", Role.ATHLETE);
    await inviteFor(coach, athlete);

    expect(
      (await coach.patch("/me/capabilities").send({ isCoach: true, isAthlete: false })).status,
    ).toBe(200);
    expect((await athlete.get("/invitations/for-me")).body).toHaveLength(1);
  });

  /**
   * Le contournement de #310 : `isCoach`/`isAthlete` sont `input: true` pour l'inscription, et
   * Better Auth accepte alors tout champ déclaré sur `/update-user` — sans `assertRemovable`.
   */
  it("refuse de cesser de coacher par /update-user, relation intacte (400)", async () => {
    const coach = await signUpWith("cap-bypass-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const athlete = await signUp("cap-bypass-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    expect((await athlete.post(`/invitations/${invitation.body.id}/accept`)).status).toBe(201);

    const res = await coach.post("/api/auth/update-user").send({ isCoach: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("FIELD_NOT_ALLOWED");
    expect(await capabilitiesOfSession(coach)).toEqual({
      isCoach: true,
      isAthlete: false,
      role: Role.COACH,
    });
    const athletes = await coach.get("/athletes");
    expect(athletes.status).toBe(200);
    expect(athletes.body).toHaveLength(1);
  });

  // Le compte sans capacité que le hook de création refuse : l'update ne doit pas y mener non plus.
  it("refuse de retirer les deux capacités par /update-user (400)", async () => {
    const agent = await signUpWith("cap-bypass-none@cmv.test", { isCoach: true, isAthlete: true });
    const res = await agent
      .post("/api/auth/update-user")
      .send({ isCoach: false, isAthlete: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("FIELD_NOT_ALLOWED");
    expect(await capabilitiesOfSession(agent)).toEqual({
      isCoach: true,
      isAthlete: true,
      role: Role.COACH,
    });
  });

  // Ajouter une capacité n'est pas plus permis : c'est là que s'accrochera l'abonnement.
  it("refuse d'ajouter une capacité par /update-user (400)", async () => {
    const agent = await signUp("cap-bypass-add@cmv.test", Role.ATHLETE);
    const res = await agent.post("/api/auth/update-user").send({ isCoach: true });
    expect(res.status).toBe(400);
    expect((await capabilitiesOfSession(agent)).isCoach).toBe(false);
  });

  // `role` est fermé par `input: false` avant même le hook — même code, même réponse.
  it("refuse de poser le persona par /update-user (400)", async () => {
    const agent = await signUp("cap-bypass-role@cmv.test", Role.ATHLETE);
    const res = await agent.post("/api/auth/update-user").send({ role: Role.COACH });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("FIELD_NOT_ALLOWED");
    expect((await capabilitiesOfSession(agent)).role).toBe(Role.ATHLETE);
  });

  // Le reste du profil passe toujours : le hook ferme les champs de capacité, pas la route.
  it("laisse modifier le nom et la langue par /update-user", async () => {
    const agent = await signUp("cap-profile@cmv.test", Role.ATHLETE);
    const res = await agent.post("/api/auth/update-user").send({ name: "Léa", locale: Locale.EN });
    expect(res.status).toBe(200);
    const session = await agent.get("/api/auth/get-session");
    expect(session.body.user).toMatchObject({ name: "Léa", locale: Locale.EN });
  });
});

describe("Compte Entreprise : exclusif, et sans accès à l'entraînement (#600)", () => {
  const COMPANY = { isCoach: false, isAthlete: false, isCompany: true };
  let company: Agent;
  let companyId: string;

  function attempt(email: string, capabilities: Record<string, boolean>) {
    return request
      .agent(baseURL)
      .post("/api/auth/sign-up/email")
      .send({ name: email, email, password: PASSWORD, ...capabilities });
  }

  beforeAll(async () => {
    company = await signUpWith("company@cmv.test", COMPANY);
    const session = await company.get("/api/auth/get-session");
    companyId = required(session.body?.user?.id, "id du compte Entreprise");
  });

  it("inscrit une entreprise seule, persona entreprise", async () => {
    const session = await company.get("/api/auth/get-session");

    expect(session.body.user).toMatchObject({
      isCompany: true,
      isCoach: false,
      isAthlete: false,
      role: Role.COMPANY,
    });
  });

  // L'entreprise porte l'id du compte : c'est ce qui la rattache, sans table de jointure.
  it("crée son entreprise sous l'id du compte", async () => {
    const organization = await app
      .get(PrismaService)
      .organization.findUnique({ where: { id: companyId } });

    expect(organization).not.toBeNull();
  });

  it.each([
    ["coach", { ...COMPANY, isCoach: true }],
    ["athlète", { ...COMPANY, isAthlete: true }],
  ])("refuse une entreprise qui serait aussi %s, sans rien créer (400)", async (_, capabilities) => {
    const email = `company-${capabilities.isCoach ? "coach" : "athlete"}@cmv.test`;

    const res = await attempt(email, capabilities);

    expect(res.status).toBe(400);
    expect(await app.get(PrismaService).user.findUnique({ where: { email } })).toBeNull();
  });

  it("refuse une inscription sans aucun type, entreprise comprise (400)", async () => {
    const res = await attempt("company-none@cmv.test", {
      isCoach: false,
      isAthlete: false,
      isCompany: false,
    });

    expect(res.status).toBe(400);
  });

  /**
   * Une route représentative de chaque module : le garde de capacité refuse avant tout service,
   * et un 403 ici, c'est la promesse « une entreprise ne voit aucun contenu d'entraînement ».
   */
  it.each([
    "/exercises",
    "/custom-metrics",
    "/sessions",
    "/plans",
    "/athletes",
    "/invitations",
    "/feedbacks",
    "/reminders",
    "/me/coaches",
    "/me/plans",
    "/invitations/for-me",
    "/invoices",
    "/conversations",
  ])("ferme %s à un compte Entreprise (403)", async (path) => {
    expect((await company.get(path)).status).toBe(403);
  });

  /**
   * Les routes sans capacité restent ouvertes : la coquille web les lit sur chaque écran. Elles ne
   * rendent que ce qui appartient au compte, c'est-à-dire rien.
   */
  it("lui laisse les routes sans capacité, vides", async () => {
    const counterparts = await company.get("/me/counterparts");
    const unread = await company.get("/me/notifications/unread-count");

    expect(counterparts.status).toBe(200);
    expect(counterparts.body).toEqual({ asCoach: false, asAthlete: false });
    expect(unread.status).toBe(200);
  });

  it("refuse de lui ajouter une capacité par PATCH /me/capabilities (403)", async () => {
    const res = await company.patch("/me/capabilities").send({ isCoach: true, isAthlete: false });

    expect(res.status).toBe(403);
    expect((await company.get("/api/auth/get-session")).body.user).toMatchObject({
      isCompany: true,
      isCoach: false,
      role: Role.COMPANY,
    });
  });

  it.each([
    ["d'en sortir", { isCompany: false }],
    ["de coacher", { isCoach: true }],
  ])("refuse à l'entreprise %s par /update-user (400)", async (_, change) => {
    const res = await company.post("/api/auth/update-user").send(change);

    expect(res.status).toBe(400);
    expect((await company.get("/api/auth/get-session")).body.user).toMatchObject(COMPANY);
  });

  it("refuse à un coach de devenir entreprise par /update-user (400)", async () => {
    const coach = await signUp("company-wannabe@cmv.test", Role.COACH);

    const res = await coach.post("/api/auth/update-user").send({ isCompany: true });

    expect(res.status).toBe(400);
    expect((await coach.get("/api/auth/get-session")).body.user.isCompany).toBe(false);
  });
});
