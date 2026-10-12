import { Role, SESSION_MAX_EXERCISES, SESSION_TOO_MANY_EXERCISES_MESSAGE } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, inviteFor, link, signUp } from "../support/actors";
import { mondayOfCurrentWeek } from "../support/fixtures";

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
      .send({ title: "Séance à débriefer", scheduledDate: monday });
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
      coachReadAt: null,
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
  let exerciseCopyId: string;

  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    coach = await signUp("suivi-coach@cmv.test", Role.COACH);
    athlete = await signUp("suivi-athlete@cmv.test", Role.ATHLETE);
    other = await signUp("suivi-other@cmv.test", Role.ATHLETE);

    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    const athleteId = accepted.body[0].athleteId;

    const exercise = await coach.post("/exercises").send({
      title: "Tractions",
      blocks: [
        {
          id: "blk_1",
          label: null,
          structure: { type: "SERIES", setCount: 4, restBetweenSetsSeconds: 150 },
          metrics: [
            {
              id: "col_reps",
              source: "CATALOG",
              key: "REPETITIONS",
              unit: "REPS",
              label: null,
              collapsed: false,
            },
          ],
          rows: [{ id: "r1", values: { col_reps: 6 } }],
        },
      ],
    });
    const template = await coach
      .post("/sessions")
      .send({ title: "Force", exercises: [{ exerciseId: exercise.body.id }] });

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
    exerciseCopyId = scheduled.body.exercises[0].id;

    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);
  });

  it("naît NON SUIVI — ce qui n'est pas « zéro coché »", async () => {
    const read = await athlete.get(`/me/scheduled-sessions/${sessionId}`);
    expect(read.status).toBe(200);
    // `null` et non `{}` : l'athlète n'a rien dit, et l'affichage doit rester silencieux.
    expect(read.body.exercises[0].tracking).toBeNull();
  });

  it("remonte avec le débrief, et distingue « rien coché » de « non suivi »", async () => {
    const sent = await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      content: null,
      tracking: { [exerciseCopyId]: { blk_1: { checked: [0, 2] } } },
    });
    expect(sent.status).toBe(200);

    const read = await athlete.get(`/me/scheduled-sessions/${sessionId}`);
    expect(read.body.exercises[0].tracking).toEqual({ blk_1: { checked: [0, 2] } });

    // Ouvert sans rien cocher : suivi, mais vide — un état distinct de l'absence.
    await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [exerciseCopyId]: {} },
    });
    expect(
      (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0].tracking,
    ).toEqual({});

    // Coché PUIS décoché : le bloc existe avec une liste vide. Ce n'est pas « non suivi » —
    // l'athlète a ouvert son suivi et l'a laissé à zéro, ce qui est une réponse.
    await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [exerciseCopyId]: { blk_1: { checked: [] } } },
    });
    expect(
      (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0].tracking,
    ).toEqual({ blk_1: { checked: [] } });

    // Et on peut y revenir : `null` remet en NON SUIVI, c'est une intention.
    await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [exerciseCopyId]: null },
    });
    expect(
      (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0].tracking,
    ).toBeNull();
  });

  // Un suivi vide ne cite aucun exercice : il ne touche à rien de ce qui est déjà coché.
  it("un suivi vide laisse intact ce qui est déjà coché", async () => {
    await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [exerciseCopyId]: { blk_1: { checked: [1] } } },
    });

    const res = await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      content: "Rien à cocher de plus",
      tracking: {},
    });

    expect(res.status).toBe(200);
    expect(
      (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0].tracking,
    ).toEqual({ blk_1: { checked: [1] } });
  });

  it("un débrief SANS texte, sans média et sans coche part quand même", async () => {
    // « J'ai fait la séance, rien à dire » est une réponse valable ; forcer du texte n'en produit
    // que de creux.
    const res = await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({});
    expect(res.status).toBe(200);
  });

  it("le COACH lit le décompte avec le débrief, résumé et sans jugement", async () => {
    // Le chaînon qui manquait : le suivi était écrit, exposé dans le DTO de la séance, et aucun
    // écran coach ne le montrait. Il accompagne désormais le débrief lui-même — le coach n'a pas
    // à charger la séance de son athlète pour savoir ce qui a été coché.
    await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      content: "Épaule sensible sur la dernière.",
      tracking: { [exerciseCopyId]: { blk_1: { checked: [0, 1, 2] } } },
    });

    const read = await coach.get(`/scheduled-sessions/${sessionId}/feedback`);
    expect(read.status).toBe(200);
    expect(read.body.trackedExercises).toEqual([
      {
        exerciseId: exerciseCopyId,
        title: "Tractions",
        state: "PARTIAL",
        done: 3,
        total: 4,
        unit: "SET",
      },
    ]);

    // Remis à NON SUIVI : l'état reste distinct de « zéro coché », y compris chez le coach.
    await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [exerciseCopyId]: null },
    });
    const untracked = await coach.get(`/scheduled-sessions/${sessionId}/feedback`);
    expect(untracked.body.trackedExercises[0]).toMatchObject({
      state: "UNTRACKED",
      done: 0,
      total: 4,
    });
  });

  it("une réécriture de la séance par le COACH ne détruit ni le dosage ni le suivi", async () => {
    // La régression que ce test verrouille, et qui a détruit des données réelles : l'édition
    // d'une séance planifiée est un replace-all. Tout ce que le client n'émet pas est effacé —
    // les blocs l'étaient à chaque enregistrement, et le suivi de l'athlète ne pouvait même PAS
    // être renvoyé, faute de rattacher une ligne à sa précédente.
    await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [exerciseCopyId]: { blk_1: { checked: [0, 1] } } },
    });

    const before = await coach.get(`/scheduled-sessions/${sessionId}`);
    const exercise = before.body.exercises[0];
    expect(exercise.blocks).toHaveLength(1);

    // Ce que le panneau du coach renvoie : il réordonne et annote, il ne touche pas au dosage.
    const saved = await coach.put(`/scheduled-sessions/${sessionId}`).send({
      title: "Force — ajustée",
      notes: null,
      scheduledDate: monday,
      exercises: [
        {
          id: exercise.id,
          sourceExerciseId: exercise.sourceExerciseId,
          title: exercise.title,
          description: exercise.description,
          tags: exercise.tags,
          note: "Note ajoutée",
          instructions: exercise.instructions,
          blocks: exercise.blocks,
          customMetrics: exercise.customMetrics,
          adjustments: exercise.adjustments,
        },
      ],
    });
    expect(saved.status).toBe(200);

    const after = saved.body.exercises[0];
    expect(after.blocks).toEqual(exercise.blocks);
    expect(after.baseline).toEqual(exercise.baseline);
    expect(after.note).toBe("Note ajoutée");
    // Le SUIVI appartient à l'athlète : il n'a pas transité par le coach, et il est toujours là.
    expect(after.tracking).toEqual({ blk_1: { checked: [0, 1] } });

    // Vu de l'athlète aussi — c'est la seule vue qui compte pour lui.
    const read = await athlete.get(`/me/scheduled-sessions/${sessionId}`);
    expect(read.body.exercises[0].tracking).toEqual({ blk_1: { checked: [0, 1] } });
    expect(read.body.exercises[0].blocks).toHaveLength(1);
  });

  it("un exercice AJOUTÉ par le coach naît sans suivi, et n'hérite pas de celui d'un autre", async () => {
    const before = await coach.get(`/scheduled-sessions/${sessionId}`);
    const exercise = before.body.exercises[0];

    const saved = await coach.put(`/scheduled-sessions/${sessionId}`).send({
      title: "Force — ajustée",
      notes: null,
      scheduledDate: monday,
      exercises: [
        {
          id: exercise.id,
          sourceExerciseId: exercise.sourceExerciseId,
          title: exercise.title,
          tags: exercise.tags,
          instructions: exercise.instructions,
          blocks: exercise.blocks,
          customMetrics: exercise.customMetrics,
          adjustments: exercise.adjustments,
        },
        // Sans `id` : ligne nouvelle. Un `id` inventé ne doit rien reprendre non plus.
        { title: "Gainage", tags: [], blocks: [] },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.exercises).toHaveLength(2);
    expect(saved.body.exercises[1].tracking).toBeNull();
    // L'exercice d'origine, lui, garde le sien.
    expect(saved.body.exercises[0].tracking).toEqual({ blk_1: { checked: [0, 1] } });
  });

  it("une coche LOCALE survit à l'enregistrement du coach, et le débrief la remonte (#311)", async () => {
    // L'athlète coche en salle, hors réseau : son suivi vit sur son téléphone, indexé par
    // l'identifiant de la ligne, et ne monte qu'au débrief. Si l'enregistrement du coach renouvelle
    // cet identifiant entre-temps, le débrief écrit sur une ligne qui n'existe plus.
    const seen = await athlete.get(`/me/scheduled-sessions/${sessionId}`);
    const [tractions, gainage] = seen.body.exercises;
    const line = (exercise: typeof tractions, note: string | null) => ({
      id: exercise.id,
      sourceExerciseId: exercise.sourceExerciseId,
      title: exercise.title,
      tags: exercise.tags,
      note,
      instructions: exercise.instructions,
      blocks: exercise.blocks,
      customMetrics: exercise.customMetrics,
      adjustments: exercise.adjustments,
    });

    // Le coach réordonne et annote : les lignes changent de rang, pas d'identité.
    const saved = await coach.put(`/scheduled-sessions/${sessionId}`).send({
      title: "Force — ajustée",
      notes: null,
      scheduledDate: monday,
      exercises: [line(gainage, "En fin de séance"), line(tractions, "Lent en descente")],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.exercises.map((e: { id: string }) => e.id)).toEqual([
      gainage.id,
      tractions.id,
    ]);

    // Le débrief part avec les identifiants que l'athlète avait AVANT l'enregistrement.
    const sent = await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [tractions.id]: { blk_1: { checked: [0, 1, 2, 3] } } },
    });
    expect(sent.status).toBe(200);

    const read = await coach.get(`/scheduled-sessions/${sessionId}/feedback`);
    expect(read.body.trackedExercises).toContainEqual(
      expect.objectContaining({ exerciseId: tractions.id, state: "DONE", done: 4, total: 4 }),
    );

    // Retirer une ligne l'emporte avec son suivi ; la ligne restante reprend le premier rang.
    const trimmed = await coach.put(`/scheduled-sessions/${sessionId}`).send({
      title: "Force — ajustée",
      notes: null,
      scheduledDate: monday,
      exercises: [line(tractions, "Lent en descente")],
    });
    expect(trimmed.status).toBe(200);
    expect(trimmed.body.exercises).toHaveLength(1);
    expect(trimmed.body.exercises[0]).toMatchObject({
      id: tractions.id,
      position: 0,
      tracking: { blk_1: { checked: [0, 1, 2, 3] } },
    });
  });

  it("refuse le même exercice cité deux fois dans la séance (400)", async () => {
    const before = (await coach.get(`/scheduled-sessions/${sessionId}`)).body;
    const exercise = before.exercises[0];
    const res = await coach.put(`/scheduled-sessions/${sessionId}`).send({
      title: before.title,
      notes: null,
      scheduledDate: monday,
      exercises: [
        { id: exercise.id, title: exercise.title },
        { id: exercise.id, title: exercise.title },
      ],
    });
    expect(res.status).toBe(400);
    // Rien n'a été écrit : la séance est celle d'avant.
    expect((await coach.get(`/scheduled-sessions/${sessionId}`)).body.exercises).toEqual(
      before.exercises,
    );
  });

  it("refuse une séance planifiée au-delà du plafond d'exercices (400), sans rien écrire", async () => {
    const before = (await coach.get(`/scheduled-sessions/${sessionId}`)).body;

    const res = await coach.put(`/scheduled-sessions/${sessionId}`).send({
      title: before.title,
      scheduledDate: before.scheduledDate,
      exercises: Array.from({ length: SESSION_MAX_EXERCISES + 1 }, (_, index) => ({
        title: `Exercice ${index}`,
      })),
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContainEqual({
      path: "exercises",
      message: SESSION_TOO_MANY_EXERCISES_MESSAGE,
    });
    expect((await coach.get(`/scheduled-sessions/${sessionId}`)).body.exercises).toEqual(
      before.exercises,
    );
  });

  /**
   * Au-delà des plafonds, le suivi est refusé avant d'atteindre le service : ni texte, ni coche,
   * ni débrief créé (#297). Une case cochée deux fois se comptait deux fois — « 6 sur 4 ».
   */
  it.each([
    [
      "plus d'exercices que la séance n'en peut porter",
      () =>
        Object.fromEntries(
          Array.from({ length: SESSION_MAX_EXERCISES + 1 }, (_, index) => [`sse_${index}`, null]),
        ),
    ],
    [
      "une case cochée deux fois",
      () => ({ [exerciseCopyId]: { blk_1: { checked: [0, 0, 0, 0, 0, 1] } } }),
    ],
  ])("refuse un suivi qui cite %s (400), sans rien écrire", async (_, tracking) => {
    const before = (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0];
    const feedbackBefore = (await athlete.get(`/me/scheduled-sessions/${sessionId}/feedback`)).body;

    const res = await athlete
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Ne doit pas s'écrire", tracking: tracking() });
    expect(res.status).toBe(400);

    const after = (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0];
    expect(after.tracking).toEqual(before.tracking);
    const feedbackAfter = (await athlete.get(`/me/scheduled-sessions/${sessionId}/feedback`)).body;
    expect(feedbackAfter?.content ?? null).toBe(feedbackBefore?.content ?? null);
  });

  it("un athlète ne suit PAS la séance d'un autre", async () => {
    const res = await other.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [exerciseCopyId]: { blk_1: { checked: [0] } } },
    });
    expect(res.status).toBe(404);
  });

  it("un exercice inconnu de la séance fait refuser le débrief (400), sans RIEN en écrire", async () => {
    // Répondre 200 en ignorant la coche, c'était laisser le client vider son suivi local pour des
    // coches qui n'avaient atterri nulle part (#311). Le refus les garde sur l'appareil.
    const before = (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0];
    const feedbackBefore = (await athlete.get(`/me/scheduled-sessions/${sessionId}/feedback`)).body;

    const res = await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      content: "Ne doit pas s'écrire",
      tracking: {
        [exerciseCopyId]: { blk_1: { checked: [0] } },
        cmv_inconnu: { blk_1: { checked: [0, 1, 2, 3] } },
      },
    });
    expect(res.status).toBe(400);

    // Ni le texte, ni la coche de l'exercice CONNU : un refus n'enregistre pas à moitié.
    const after = (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0];
    expect(after.tracking).toEqual(before.tracking);
    const feedbackAfter = (await athlete.get(`/me/scheduled-sessions/${sessionId}/feedback`)).body;
    expect(feedbackAfter.content).toBe(feedbackBefore.content);
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
      .send({ title: "Séance relue", scheduledDate: monday });
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
