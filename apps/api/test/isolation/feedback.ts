import { Role, SESSION_MAX_BLOCKS } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, inviteFor, link, signUp } from "../support/actors";
import { blocksOf } from "../support/blocks";
import { fromTemplate, mondayOfCurrentWeek } from "../support/fixtures";
import { putAtLatest } from "../support/version";

describe("Débrief de séance (P4)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let athleteB1: Agent;
  let a1Id: string;
  let planId: string;
  let weekId: string;
  let draftSessionId: string;
  let sessionId: string;

  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    coachA = await signUp("fb-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("fb-athlete-a1@cmv.test", Role.ATHLETE);
    const coachB = await signUp("fb-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("fb-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    await link(coachB, athleteB1);

    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle débrief",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;
    weekId = plan.body.weeks[0].id;

    const session = await coachA
      .post(`/plan-weeks/${weekId}/sessions`)
      .send(await fromTemplate(coachA, { title: "Séance à débriefer", scheduledDate: monday }));
    draftSessionId = session.body.id;
  });

  // ⚠️ Le scope tenant ne filtre PAS le statut : sans la garde du service, l'athlète pourrait
  // débriefer une séance d'un cycle que son coach est encore en train d'écrire.
  it("refuse de débriefer une séance d'un cycle non diffusé", async () => {
    const res = await athleteA1
      .put(`/me/scheduled-sessions/${draftSessionId}/feedback`)
      .send({ content: "Trop tôt" });
    expect(res.status).toBe(404);
  });

  it("aucun débrief avant écriture : null, pas un objet vide", async () => {
    await billAndPublish(coachA, planId);
    sessionId = draftSessionId;

    const res = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("débriefe la séance : le texte est enregistré et la séance passe en DONE", async () => {
    const before = await coachA.get(`/scheduled-sessions/${sessionId}`);
    const res = await athleteA1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Bonne séance, épaule un peu sensible sur les tractions." });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      scheduledSessionId: sessionId,
      athleteId: a1Id,
      content: "Bonne séance, épaule un peu sensible sur les tractions.",
      media: [],
    });

    const session = await athleteA1.get(`/me/scheduled-sessions/${sessionId}`);
    expect(session.body.status).toBe("DONE");
    // La version reste celle du coach (#604) : le débrief ne change rien de ce qu'il a composé, et
    // ne doit pas faire refuser son enregistrement par un conflit qui ne dit pas vrai.
    expect(session.body.updatedAt).toBe(before.body.updatedAt);
  });

  // L'athlète débriefe en plusieurs fois : le PUT est idempotent, pas un doublon.
  it("compléter un débrief le met à jour au lieu d'en créer un second", async () => {
    const res = await athleteA1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Complément : douleur passée après échauffement." });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe("Complément : douleur passée après échauffement.");

    const reread = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    expect(reread.body.id).toBe(res.body.id);
  });

  // Un débrief vide est un état légitime (« séance faite, rien à signaler »).
  it("accepte un débrief sans texte", async () => {
    const res = await athleteA1.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({});
    expect(res.status).toBe(200);
    expect(res.body.content).toBeNull();
  });

  it("refuse un texte au-delà de la limite du schéma", async () => {
    const res = await athleteA1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "x".repeat(5001) });
    expect(res.status).toBe(400);
  });

  it("l'athlète d'un autre coach ne lit ni n'écrit ce débrief", async () => {
    expect((await athleteB1.get(`/me/scheduled-sessions/${sessionId}/feedback`)).status).toBe(200);
    expect((await athleteB1.get(`/me/scheduled-sessions/${sessionId}/feedback`)).body).toBeNull();

    const write = await athleteB1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Intrusion" });
    expect(write.status).toBe(404);
  });

  it("le débrief reste une écriture d'athlète : le coach n'y accède pas par /me", async () => {
    expect((await coachA.get(`/me/scheduled-sessions/${sessionId}/feedback`)).status).toBe(403);
    expect(
      (await coachA.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({ content: "x" }))
        .status,
    ).toBe(403);
  });
});

describe("Suivi d'exécution (#168)", () => {
  let coach: Agent;
  let athlete: Agent;
  let other: Agent;
  let sessionId: string;
  let blockId: string;

  const monday = mondayOfCurrentWeek();

  const read = async () =>
    (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.blocks[0].tracking;
  const send = (body: object) =>
    athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send(body);

  beforeAll(async () => {
    coach = await signUp("suivi-coach@cmv.test", Role.COACH);
    athlete = await signUp("suivi-athlete@cmv.test", Role.ATHLETE);
    other = await signUp("suivi-other@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    const athleteId = accepted.body[0].athleteId;

    const exercise = await coach.post("/exercises").send({ title: "Tractions" });
    const template = await coach
      .post("/sessions")
      .send({ title: "Force", blocks: blocksOf(exercise.body.id) });

    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle suivi",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const scheduled = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: monday });
    sessionId = scheduled.body.id;
    blockId = scheduled.body.blocks[0].id;

    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);
  });

  it("naît NON SUIVI — ce qui n'est pas « zéro coché »", async () => {
    // `null` et non `{ checked: [] }` : l'athlète n'a rien dit, et l'affichage doit rester silencieux.
    await expect(read()).resolves.toBeNull();
  });

  // Un suivi vide ne cite aucun bloc : il ne touche à rien de ce qui est déjà coché.
  it("un suivi vide laisse intact ce qui est déjà coché", async () => {
    await send({ blockTracking: { [blockId]: { checked: [{ row: 1, key: "a1" }] } } });

    const res = await send({ content: "Rien à cocher de plus", blockTracking: {} });

    expect(res.status).toBe(200);
    await expect(read()).resolves.toEqual({ checked: [{ row: 1, key: "a1" }] });
  });

  it("un débrief SANS texte, sans média et sans coche part quand même", async () => {
    // « J'ai fait la séance, rien à dire » est une réponse valable ; forcer du texte n'en produit
    // que de creux.
    const res = await send({});
    expect(res.status).toBe(200);
  });

  it("l'édition de la séance par le COACH ne touche pas au suivi de l'athlète", async () => {
    await send({ blockTracking: { [blockId]: { checked: [{ row: 0, key: "a1" }] } } });

    const saved = await putAtLatest(coach, `/scheduled-sessions/${sessionId}`, {
      title: "Force — ajustée",
      notes: "Lent en descente",
      scheduledDate: monday,
    });
    expect(saved.status).toBe(200);
    // Le SUIVI appartient à l'athlète : il n'a pas transité par le coach, et il est toujours là.
    expect(saved.body.blocks[0].tracking).toEqual({ checked: [{ row: 0, key: "a1" }] });
    await expect(read()).resolves.toEqual({ checked: [{ row: 0, key: "a1" }] });
  });

  /**
   * Au-delà des plafonds, le suivi est refusé avant d'atteindre le service : ni texte, ni coche,
   * ni débrief créé (#297). Une case cochée deux fois se comptait deux fois — « 6 sur 4 ».
   */
  it.each([
    [
      "plus de blocs que la séance n'en peut porter",
      () =>
        Object.fromEntries(
          Array.from({ length: SESSION_MAX_BLOCKS + 1 }, (_, index) => [`blk_${index}`, null]),
        ),
    ],
    [
      "une case cochée deux fois",
      () => ({
        [blockId]: {
          checked: [
            { row: 0, key: "a1" },
            { row: 0, key: "a1" },
          ],
        },
      }),
    ],
    [
      "un bloc inconnu de la séance, à côté d'un bloc connu",
      // Répondre 200 en ignorant la coche, c'était laisser le client vider son suivi local pour
      // des coches qui n'avaient atterri nulle part (#311). Le refus les garde sur l'appareil.
      () => ({
        [blockId]: { checked: [{ row: 2, key: "a1" }] },
        blk_inconnu: { checked: [{ row: 0, key: "a1" }] },
      }),
    ],
  ])("refuse un suivi qui cite %s (400), sans rien écrire", async (_, blockTracking) => {
    const before = await read();
    const feedbackBefore = (await athlete.get(`/me/scheduled-sessions/${sessionId}/feedback`)).body;

    const res = await send({ content: "Ne doit pas s'écrire", blockTracking: blockTracking() });
    expect(res.status).toBe(400);

    // Ni le texte, ni la coche du bloc CONNU : un refus n'enregistre pas à moitié.
    await expect(read()).resolves.toEqual(before);
    const feedbackAfter = (await athlete.get(`/me/scheduled-sessions/${sessionId}/feedback`)).body;
    expect(feedbackAfter?.content ?? null).toBe(feedbackBefore?.content ?? null);
  });

  it("un athlète ne suit PAS la séance d'un autre", async () => {
    const res = await other.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      blockTracking: { [blockId]: { checked: [{ row: 0, key: "a1" }] } },
    });
    expect(res.status).toBe(404);
  });
});

describe("Lecture coach des débriefs (P4)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let sessionId: string;
  let feedbackId: string;

  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    coachA = await signUp("read-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("read-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("read-athlete-a1@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coachA, athleteA1);
    const accepted = await athleteA1.post(`/invitations/${invitation.body.id}/accept`);

    const plan = await coachA.post("/plans").send({
      athleteId: accepted.body[0].athleteId,
      title: "Cycle lu",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coachA
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send(await fromTemplate(coachA, { title: "Séance relue", scheduledDate: monday }));
    sessionId = session.body.id;
    await billAndPublish(coachA, plan.body.id);

    await athleteA1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Séance dure mais bien passée." });
  });

  it("le coach liste les débriefs de ses athlètes, nommés et non lus", async () => {
    const res = await coachA.get("/feedbacks");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    feedbackId = res.body[0].id;
    expect(res.body[0]).toMatchObject({
      scheduledSessionId: sessionId,
      // Le nom, pas un id opaque : le coach suit N athlètes.
      athleteName: "read-athlete-a1@cmv.test",
      sessionTitle: "Séance relue",
      scheduledDate: monday,
      content: "Séance dure mais bien passée.",
      mediaCount: 0,
      coachReadAt: null,
    });
  });

  it("le coach lit le détail du débrief d'une séance", async () => {
    const res = await coachA.get(`/scheduled-sessions/${sessionId}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body.content).toBe("Séance dure mais bien passée.");
    expect(res.body.media).toEqual([]);
  });

  it("marquer comme lu est idempotent : la date de lecture ne bouge plus", async () => {
    const first = await coachA.post(`/feedbacks/${feedbackId}/read`);
    expect(first.status).toBe(201);
    expect(first.body.coachReadAt).not.toBeNull();

    const second = await coachA.post(`/feedbacks/${feedbackId}/read`);
    expect(second.body.coachReadAt).toBe(first.body.coachReadAt);
  });

  // Le cœur du marqueur : un ajout tardif de l'athlète doit ressortir comme « à relire ».
  it("compléter le débrief le rend à relire", async () => {
    await athleteA1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Ajout : douleur au doigt sur la fin." });

    const res = await coachA.get("/feedbacks");
    expect(res.body[0].coachReadAt).toBeNull();
    expect(res.body[0].content).toBe("Ajout : douleur au doigt sur la fin.");
  });

  it("un autre coach ne voit ni ne marque ce débrief", async () => {
    expect((await coachB.get("/feedbacks")).body).toEqual([]);
    expect((await coachB.post(`/feedbacks/${feedbackId}/read`)).status).toBe(404);
    expect((await coachB.get(`/scheduled-sessions/${sessionId}/feedback`)).body).toBeNull();
  });

  it("l'athlète n'accède pas aux routes coach", async () => {
    expect((await athleteA1.get("/feedbacks")).status).toBe(403);
    expect((await athleteA1.post(`/feedbacks/${feedbackId}/read`)).status).toBe(403);
  });
});
