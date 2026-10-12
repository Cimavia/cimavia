import { Role, SESSION_MAX_EXERCISES, SESSION_TOO_MANY_EXERCISES_MESSAGE } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { API_BODY_LIMIT_BYTES } from "../../src/app.setup";
import { type Agent, billAndPublish, inviteFor, signUp, signUpWith } from "../support/actors";
import { mondayOfCurrentWeek } from "../support/fixtures";
import { versionOf } from "../support/version";

describe("Composition & isolation des séances (P2)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athlete: Agent;
  let exA1: string;
  let exA2: string;
  let exB: string;
  let sessionAId: string;

  // Crée un exercice pour le coach donné et retourne son id.
  async function createExercise(coach: Agent, title: string): Promise<string> {
    const res = await coach.post("/exercises").send({ title });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  beforeAll(async () => {
    coachA = await signUp("se-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("se-coach-b@cmv.test", Role.COACH);
    athlete = await signUp("se-athlete@cmv.test", Role.ATHLETE);

    exA1 = await createExercise(coachA, "Échauffement épaules");
    exA2 = await createExercise(coachA, "Tractions lestées");
    exB = await createExercise(coachB, "Exercice du coach B");
  });

  it("crée une séance avec une composition ordonnée (positions + note)", async () => {
    const res = await coachA.post("/sessions").send({
      title: "Bloc force max",
      notes: "Repos 3 min entre séries.",
      exercises: [
        { exerciseId: exA1, note: "10 min mobilité" },
        { exerciseId: exA2, note: "5×5 à +10 kg" },
      ],
    });
    expect(res.status).toBe(201);
    sessionAId = res.body.id;
    expect(res.body.exercises).toHaveLength(2);
    expect(res.body.exercises[0]).toMatchObject({
      exerciseId: exA1,
      position: 0,
      title: "Échauffement épaules",
    });
    expect(res.body.exercises[1]).toMatchObject({ exerciseId: exA2, position: 1 });
  });

  it("refuse une séance référençant l'exercice d'un autre coach (400)", async () => {
    const res = await coachA.post("/sessions").send({
      title: "Intrusion",
      exercises: [{ exerciseId: exB }],
    });
    expect(res.status).toBe(400);
  });

  /**
   * Le même exercice cité à chaque ligne : la forme qui faisait recopier ses blocs autant de fois
   * (#297). Au plafond exact, elle reste une composition légitime.
   */
  it(`accepte ${SESSION_MAX_EXERCISES} lignes citant le même exercice`, async () => {
    const res = await coachA.put(`/sessions/${sessionAId}`).send({
      title: "Bloc force max",
      exercises: Array.from({ length: SESSION_MAX_EXERCISES }, () => ({ exerciseId: exA1 })),
    });
    expect(res.status).toBe(200);
    expect(res.body.exercises).toHaveLength(SESSION_MAX_EXERCISES);
    expect(res.body.exercises.at(-1)).toMatchObject({
      exerciseId: exA1,
      position: SESSION_MAX_EXERCISES - 1,
    });
  });

  it("refuse un exercice de plus que le plafond (400), sans rien écrire", async () => {
    const tooMany = Array.from({ length: SESSION_MAX_EXERCISES + 1 }, () => ({ exerciseId: exA1 }));

    const updated = await coachA
      .put(`/sessions/${sessionAId}`)
      .send({ title: "Trop long", exercises: tooMany });
    expect(updated.status).toBe(400);
    expect(updated.body.message).toContainEqual({
      path: "exercises",
      message: SESSION_TOO_MANY_EXERCISES_MESSAGE,
    });
    const reread = await coachA.get(`/sessions/${sessionAId}`);
    expect(reread.body.title).toBe("Bloc force max");
    expect(reread.body.exercises).toHaveLength(SESSION_MAX_EXERCISES);

    const created = await coachA.post("/sessions").send({ title: "Trop long", exercises: tooMany });
    expect(created.status).toBe(400);
    expect((await coachA.get("/sessions")).body).toHaveLength(1);
  });

  // Le corps est refusé avant d'être parsé : aucun schéma n'a à juger ce qui ne tient pas.
  it("refuse un corps au-delà du plafond de l'API (413)", async () => {
    const res = await coachA
      .post("/sessions")
      .send({ title: "Trop lourd", notes: "x".repeat(API_BODY_LIMIT_BYTES) });
    expect(res.status).toBe(413);
    expect((await coachA.get("/sessions")).body).toHaveLength(1);
  });

  it("met à jour la séance en remplaçant intégralement la composition (replace-all)", async () => {
    const res = await coachA.put(`/sessions/${sessionAId}`).send({
      title: "Bloc force max (v2)",
      notes: null,
      exercises: [{ exerciseId: exA2, note: "4×6" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Bloc force max (v2)");
    expect(res.body.notes).toBeNull();
    expect(res.body.exercises).toHaveLength(1);
    expect(res.body.exercises[0]).toMatchObject({ exerciseId: exA2, position: 0 });
  });

  it("un coach ne voit/modifie/supprime que SES séances", async () => {
    const own = await coachA.get("/sessions");
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);

    const other = await coachB.get("/sessions");
    expect(other.body).toHaveLength(0);

    expect((await coachB.get(`/sessions/${sessionAId}`)).status).toBe(404);
    expect(
      (await coachB.put(`/sessions/${sessionAId}`).send({ title: "x", exercises: [] })).status,
    ).toBe(404);
    expect((await coachB.delete(`/sessions/${sessionAId}`)).status).toBe(404);
  });

  it("un athlète n'a aucun accès aux séances (route coach)", async () => {
    expect((await athlete.get("/sessions")).status).toBe(403);
  });

  // SessionExercise.exercise est en onDelete: Restrict → sans garde applicative, la suppression
  // remonterait une violation de clé étrangère (500) au lieu d'un refus explicite.
  it("supprimer un exercice utilisé dans une séance est refusé (409), puis autorisé une fois retiré", async () => {
    // exA2 est encore dans la séance (replace-all précédent).
    const conflict = await coachA.delete(`/exercises/${exA2}`);
    expect(conflict.status).toBe(409);

    // On vide la composition → l'exercice n'est plus référencé.
    const emptied = await coachA
      .put(`/sessions/${sessionAId}`)
      .send({ title: "Bloc force max (v2)", notes: null, exercises: [] });
    expect(emptied.status).toBe(200);

    expect((await coachA.delete(`/exercises/${exA2}`)).status).toBe(204);
  });

  it("supprimer une séance est possible et laisse les exercices intacts", async () => {
    expect((await coachA.delete(`/sessions/${sessionAId}`)).status).toBe(204);
    expect((await coachA.get("/sessions")).body).toHaveLength(0);
    // exA1 n'était plus dans la séance mais existe toujours en bibliothèque.
    expect((await coachA.get(`/exercises/${exA1}`)).status).toBe(200);
  });
});

describe("Dosage à trois niveaux (#164)", () => {
  let coach: Agent;
  let other: Agent;
  let exerciseId: string;
  let sessionId: string;
  let composedId: string;

  // Un exercice à un bloc Séries, deux lignes, une colonne : le plus petit dosage qui se surcharge.
  const BLOCKS = [
    {
      id: "blk_1",
      label: "Travail",
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
      rows: [
        { id: "r1", values: { col_reps: 6 } },
        { id: "r2", values: { col_reps: 5 } },
      ],
    },
  ];

  const adjusted = (reps: number) => [
    {
      ...BLOCKS[0],
      rows: [
        { id: "r1", values: { col_reps: reps } },
        { id: "r2", values: { col_reps: 5 } },
      ],
    },
  ];

  beforeAll(async () => {
    coach = await signUp("dosage-coach@cmv.test", Role.COACH);
    other = await signUp("dosage-other@cmv.test", Role.COACH);

    const exercise = await coach.post("/exercises").send({ title: "Tractions", blocks: BLOCKS });
    expect(exercise.status).toBe(201);
    exerciseId = exercise.body.id;

    const session = await coach
      .post("/sessions")
      .send({ title: "Bloc force", exercises: [{ exerciseId }] });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
    composedId = session.body.exercises[0].id;
  });

  it("copie le dosage de l'exercice à l'AJOUT, référence comprise", async () => {
    const read = await coach.get(`/sessions/${sessionId}`);
    const composed = read.body.exercises[0];
    expect(composed.blocks).toEqual(BLOCKS);
    expect(composed.baseline).toEqual(BLOCKS);
    expect(composed.adjustments).toEqual([]);
  });

  it("conserve la référence quand la composition est réécrite", async () => {
    // Le remplace-all détruit et recrée les lignes : sans le report de la référence,
    // « Tout réinitialiser » reviendrait à la dernière sauvegarde au lieu de l'ajout.
    const res = await coach.put(`/sessions/${sessionId}`).send({
      title: "Bloc force",
      exercises: [
        {
          id: composedId,
          exerciseId,
          blocks: adjusted(8),
          adjustments: [{ path: "blk_1/rows/r1/col_reps", level: "SESSION" }],
        },
      ],
    });
    expect(res.status).toBe(200);

    const composed = res.body.exercises[0];
    expect(composed.blocks[0].rows[0].values.col_reps).toBe(8);
    // La référence n'a PAS bougé : c'est toujours ce qui a été copié à l'ajout.
    expect(composed.baseline).toEqual(BLOCKS);
    expect(composed.adjustments).toEqual([{ path: "blk_1/rows/r1/col_reps", level: "SESSION" }]);
    composedId = composed.id;
  });

  const REPS = BLOCKS[0]?.metrics[0];

  it.each([
    ["le libellé du bloc", () => [{ ...BLOCKS[0], label: "Échauffement" }]],
    ["le type de structure", () => [{ ...BLOCKS[0], structure: { type: "FREE" } }]],
    [
      "l'unité d'une colonne",
      () => [{ ...BLOCKS[0], metrics: [{ ...REPS, unit: "REPS_PER_SIDE" }] }],
    ],
    [
      "le libellé d'une colonne",
      () => [{ ...BLOCKS[0], metrics: [{ ...REPS, label: "Passages" }] }],
    ],
    ["le nombre de blocs", () => []],
  ])("REFUSE de changer %s au niveau séance", async (_label, build) => {
    // Le verrou est vérifié côté serveur : un formulaire n'est pas une frontière.
    const res = await coach.put(`/sessions/${sessionId}`).send({
      title: "Bloc force",
      exercises: [{ id: composedId, exerciseId, blocks: build() }],
    });
    expect(res.status).toBe(400);
  });

  it("ACCEPTE le repli d'une colonne — c'est de l'affichage, pas de la donnée", async () => {
    const collapsed = [{ ...BLOCKS[0], metrics: [{ ...REPS, collapsed: true }] }];
    const res = await coach.put(`/sessions/${sessionId}`).send({
      title: "Bloc force",
      exercises: [{ id: composedId, exerciseId, blocks: collapsed }],
    });
    expect(res.status).toBe(200);
    composedId = res.body.exercises[0].id;

    // Remis en place : les tests suivants partent de la grille complète.
    const restored = await coach.put(`/sessions/${sessionId}`).send({
      title: "Bloc force",
      exercises: [{ id: composedId, exerciseId, blocks: adjusted(8) }],
    });
    composedId = restored.body.exercises[0].id;
  });

  it("recharge depuis la bibliothèque : la référence suit, les ajustements tombent", async () => {
    // L'exercice de bibliothèque change APRÈS la composition.
    const updated = [{ ...BLOCKS[0], rows: [{ id: "r1", values: { col_reps: 12 } }] }];
    expect(
      (
        await coach.patch(`/exercises/${exerciseId}`).send({
          expectedUpdatedAt: await versionOf(coach, `/exercises/${exerciseId}`),
          blocks: updated,
        })
      ).status,
    ).toBe(200);

    // Tant qu'on ne recharge pas, la séance ne bouge PAS — elle est indépendante une fois composée.
    const before = await coach.get(`/sessions/${sessionId}`);
    expect(before.body.exercises[0].baseline).toEqual(BLOCKS);

    const res = await coach.post(`/sessions/${sessionId}/exercises/${composedId}/reload`);
    expect(res.status).toBe(201);
    const composed = res.body.exercises[0];
    expect(composed.blocks).toEqual(updated);
    expect(composed.baseline).toEqual(updated);
    expect(composed.adjustments).toEqual([]);
  });

  it("un coach ne recharge PAS l'exercice d'une séance d'un autre coach", async () => {
    const res = await other.post(`/sessions/${sessionId}/exercises/${composedId}/reload`);
    expect(res.status).toBe(404);
  });
});

describe("Dosage au niveau planifié : ajusté pour un athlète (#518)", () => {
  let coach: Agent;
  let exerciseId: string;
  let templateId: string;
  let planId: string;
  let week1Id: string;
  let week2Id: string;
  let sessionId: string;

  const monday = mondayOfCurrentWeek();
  const R1 = "blk_1/rows/r1/col_reps";
  const R2 = "blk_1/rows/r2/col_reps";

  const BLOCKS = [
    {
      id: "blk_1",
      label: "Travail",
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
      rows: [
        { id: "r1", values: { col_reps: 6 } },
        { id: "r2", values: { col_reps: 5 } },
      ],
    },
  ];
  const withR1 = (reps: number) => [
    { ...BLOCKS[0], rows: [{ id: "r1", values: { col_reps: reps } }, BLOCKS[0]?.rows[1]] },
  ];

  /** Ce que le panneau du coach renvoie pour une ligne reprise : le snapshot entier. */
  async function exerciseLine(overrides: Record<string, unknown>) {
    const read = await coach.get(`/scheduled-sessions/${sessionId}`);
    const exercise = read.body.exercises[0];
    return {
      id: exercise.id,
      sourceExerciseId: exercise.sourceExerciseId,
      title: exercise.title,
      tags: exercise.tags,
      instructions: exercise.instructions,
      blocks: exercise.blocks,
      customMetrics: exercise.customMetrics,
      adjustments: exercise.adjustments,
      ...overrides,
    };
  }

  function save(exercises: unknown[]) {
    return coach.put(`/scheduled-sessions/${sessionId}`).send({
      title: "Force",
      notes: null,
      scheduledDate: monday,
      exercises,
    });
  }

  beforeAll(async () => {
    coach = await signUp("scheduled-dosage-coach@cmv.test", Role.COACH);

    const exercise = await coach.post("/exercises").send({ title: "Tractions", blocks: BLOCKS });
    exerciseId = exercise.body.id;

    // La séance-type ajuste r1 : 6 → 8, marqué SESSION.
    const template = await coach
      .post("/sessions")
      .send({ title: "Force", exercises: [{ exerciseId }] });
    templateId = template.body.id;
    const saved = await coach.put(`/sessions/${templateId}`).send({
      title: "Force",
      exercises: [
        {
          id: template.body.exercises[0].id,
          exerciseId,
          blocks: withR1(8),
          adjustments: [{ path: R1, level: "SESSION" }],
        },
      ],
    });
    expect(saved.status).toBe(200);

    // Un brouillon sans destinataire suffit (#144) : le dosage ne dépend pas de l'athlète.
    const plan = await coach.post("/plans").send({
      title: "Cycle dosage",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }],
    });
    planId = plan.body.id;
    [week1Id, week2Id] = plan.body.weeks.map((week: { id: string }) => week.id);

    const diffused = await coach
      .post(`/plan-weeks/${week1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: monday });
    expect(diffused.status).toBe(201);
    sessionId = diffused.body.id;
  });

  it("garde les marqueurs reçus de la séance-type comme référence des marqueurs", async () => {
    const read = await coach.get(`/scheduled-sessions/${sessionId}`);
    const exercise = read.body.exercises[0];
    expect(exercise.blocks).toEqual(withR1(8));
    expect(exercise.adjustments).toEqual([{ path: R1, level: "SESSION" }]);
    expect(exercise.baselineAdjustments).toEqual([{ path: R1, level: "SESSION" }]);
  });

  it("une séance posée depuis un modèle AVEC sa propre composition n'a reçu aucun marqueur", async () => {
    // Le client a composé lui-même : rien n'a été diffusé par la séance-type, sa référence est
    // ce qu'il envoie — même s'il y pose des marqueurs.
    const res = await coach.post(`/plan-weeks/${week1Id}/sessions`).send({
      sourceSessionId: templateId,
      scheduledDate: monday,
      exercises: [
        {
          sourceExerciseId: exerciseId,
          title: "Tractions",
          blocks: withR1(9),
          adjustments: [{ path: R1, level: "SESSION" }],
        },
      ],
    });
    expect(res.status).toBe(201);

    const exercise = res.body.exercises[0];
    expect(exercise.baseline).toEqual(withR1(9));
    expect(exercise.baselineAdjustments).toEqual([]);

    // Retirée aussitôt : la copie de semaine plus bas n'attend qu'une séance dans la semaine 1.
    expect((await coach.delete(`/scheduled-sessions/${res.body.id}`)).status).toBe(204);
  });

  it("ACCEPTE un changement de valeur pour l'athlète, sans toucher aux deux références", async () => {
    const res = await save([
      await exerciseLine({
        blocks: withR1(10),
        adjustments: [{ path: R1, level: "SCHEDULED" }],
      }),
    ]);
    expect(res.status).toBe(200);

    const exercise = res.body.exercises[0];
    expect(exercise.blocks).toEqual(withR1(10));
    expect(exercise.adjustments).toEqual([{ path: R1, level: "SCHEDULED" }]);
    // Ce que la séance a diffusé ne bouge pas : c'est ce que « Revenir au défaut » rendra.
    expect(exercise.baseline).toEqual(withR1(8));
    expect(exercise.baselineAdjustments).toEqual([{ path: R1, level: "SESSION" }]);
  });

  const REPS = BLOCKS[0]?.metrics[0];

  it.each([
    ["le libellé du bloc", () => [{ ...BLOCKS[0], label: "Échauffement" }]],
    ["le type de structure", () => [{ ...BLOCKS[0], structure: { type: "FREE" } }]],
    [
      "l'unité d'une colonne",
      () => [{ ...BLOCKS[0], metrics: [{ ...REPS, unit: "REPS_PER_SIDE" }] }],
    ],
    ["le nombre de blocs", () => []],
  ])("REFUSE de changer %s au niveau planifié", async (_label, build) => {
    // Le verrou est vérifié côté serveur, contre la référence STOCKÉE : un formulaire n'est pas
    // une frontière, et le panneau du coach n'est pas le seul client possible.
    const res = await save([await exerciseLine({ blocks: build() })]);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Structure verrouillée au niveau séance planifiée");
  });

  it("REFUSE une référence des marqueurs envoyée par le client", async () => {
    // Le client n'envoie que des valeurs, jamais la référence : il pourrait sinon effacer ce que
    // la séance-type a diffusé.
    const res = await save([await exerciseLine({ baselineAdjustments: [] })]);
    expect(res.status).toBe(400);
  });

  it("un exercice AJOUTÉ a pour référence son propre dosage, sans marqueur reçu", async () => {
    const res = await save([
      await exerciseLine({}),
      {
        sourceExerciseId: exerciseId,
        title: "Tractions bis",
        tags: [],
        // Une forme libre : aucune référence à respecter pour une ligne qui naît.
        blocks: [{ ...BLOCKS[0], label: "Autre" }],
        adjustments: [{ path: R2, level: "SCHEDULED" }],
      },
    ]);
    expect(res.status).toBe(200);

    const added = res.body.exercises[1];
    expect(added.baseline).toEqual([{ ...BLOCKS[0], label: "Autre" }]);
    expect(added.baselineAdjustments).toEqual([]);
  });

  it("la copie de semaine emporte la référence des marqueurs avec celle des valeurs", async () => {
    const res = await coach
      .post(`/plan-weeks/${week2Id}/copy-from`)
      .send({ sourcePlanWeekId: week1Id });
    expect(res.status).toBe(201);

    const plan = await coach.get(`/plans/${planId}`);
    const week2 = plan.body.weeks.find((week: { id: string }) => week.id === week2Id);
    const copy = await coach.get(`/scheduled-sessions/${week2.sessions[0].id}`);
    const exercise = copy.body.exercises[0];
    expect(exercise.adjustments).toEqual([{ path: R1, level: "SCHEDULED" }]);
    expect(exercise.baseline).toEqual(withR1(8));
    expect(exercise.baselineAdjustments).toEqual([{ path: R1, level: "SESSION" }]);
  });
});

describe("Rangs d'une journée : aucun trou après un départ (#148)", () => {
  /** Un cycle d'une semaine pour `coach`, et l'id de sa première semaine. */
  async function weekOf(coach: Agent, athleteId: string, monday: string): Promise<string> {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle des rangs",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    return plan.body.weeks[0].id;
  }

  /** Les rangs du jour, dans l'ordre où l'API les rend. */
  async function positionsOn(coach: Agent, planId: string, date: string): Promise<number[]> {
    const plan = await coach.get(`/plans/${planId}`);
    return plan.body.weeks[0].sessions
      .filter((session: { scheduledDate: string }) => session.scheduledDate === date)
      .map((session: { position: number }) => session.position);
  }

  async function addSession(coach: Agent, weekId: string, date: string, title: string) {
    const created = await coach.post(`/plan-weeks/${weekId}/sessions`).send({
      scheduledDate: date,
      title,
    });
    expect(created.status).toBe(201);
    return created.body.id;
  }

  /**
   * Le bug que ce bloc ferme : `nextPosition` COMPTE les séances du jour, ce qui ne donne un rang
   * libre que si les rangs sont contigus. Une suppression au milieu laissait un trou, et l'ajout
   * suivant retombait sur un rang déjà pris — 500 sur `@@unique([planWeekId, scheduledDate,
   * position])`, pour un geste que rien ne relie à la suppression d'avant.
   */
  it("recolle les rangs après une suppression, et le jour reste ajoutable", async () => {
    const coach = await signUpWith("gap-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("gap-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const athleteId = (await athlete.post(`/invitations/${invitation.body.id}/accept`)).body[0]
      .athleteId;

    const monday = mondayOfCurrentWeek();
    const weekId = await weekOf(coach, athleteId, monday);
    const planId = (await coach.get("/plans")).body[0].id;

    const first = await addSession(coach, weekId, monday, "Séance 1");
    await addSession(coach, weekId, monday, "Séance 2");
    await addSession(coach, weekId, monday, "Séance 3");
    expect(await positionsOn(coach, planId, monday)).toEqual([0, 1, 2]);

    expect((await coach.delete(`/scheduled-sessions/${first}`)).status).toBe(204);
    expect(await positionsOn(coach, planId, monday)).toEqual([0, 1]);

    // Le geste qui échouait : ajouter après avoir supprimé.
    await addSession(coach, weekId, monday, "Séance 4");
    expect(await positionsOn(coach, planId, monday)).toEqual([0, 1, 2]);
  });

  // Déplacer une séance, c'est aussi QUITTER un jour : celui qu'on laisse se recolle comme un
  // jour dont on a supprimé une séance, et celui qu'on rejoint prend la fin de file.
  it("recolle le jour quitté quand une séance change de date", async () => {
    const coach = await signUpWith("move-coach@cmv.test", { isCoach: true, isAthlete: false });
    const athlete = await signUp("move-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const athleteId = (await athlete.post(`/invitations/${invitation.body.id}/accept`)).body[0]
      .athleteId;

    const monday = mondayOfCurrentWeek();
    const tuesday = new Date(`${monday}T00:00:00Z`);
    tuesday.setUTCDate(tuesday.getUTCDate() + 1);
    const tuesdayIso = tuesday.toISOString().slice(0, 10);

    const weekId = await weekOf(coach, athleteId, monday);
    const planId = (await coach.get("/plans")).body[0].id;

    const first = await addSession(coach, weekId, monday, "Lundi 1");
    await addSession(coach, weekId, monday, "Lundi 2");
    await addSession(coach, weekId, monday, "Lundi 3");

    const moved = await coach.put(`/scheduled-sessions/${first}`).send({
      title: "Lundi 1",
      scheduledDate: tuesdayIso,
      exercises: [],
    });
    expect(moved.status).toBe(200);

    expect(await positionsOn(coach, planId, monday)).toEqual([0, 1]);
    expect(await positionsOn(coach, planId, tuesdayIso)).toEqual([0]);

    // Le lundi reste ajoutable : c'est ce que le trou cassait.
    await addSession(coach, weekId, monday, "Lundi 4");
    expect(await positionsOn(coach, planId, monday)).toEqual([0, 1, 2]);
  });
});

describe("Réordonner les séances d'une même journée (#148)", () => {
  const monday = mondayOfCurrentWeek();

  type Day = {
    coach: Agent;
    athlete: Agent;
    planId: string;
    weekId: string;
    sessionIds: string[];
  };

  /** Un coach, son athlète, un cycle d'une semaine, et `count` séances le lundi. */
  async function dayOf(slug: string, count: number): Promise<Day> {
    const coach = await signUpWith(`${slug}-coach@cmv.test`, { isCoach: true, isAthlete: false });
    const athlete = await signUp(`${slug}-athlete@cmv.test`, Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const athleteId = (await athlete.post(`/invitations/${invitation.body.id}/accept`)).body[0]
      .athleteId;

    const plan = await coach.post("/plans").send({
      athleteId,
      title: `Cycle ${slug}`,
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const weekId = plan.body.weeks[0].id;

    const sessionIds: string[] = [];
    for (let rank = 1; rank <= count; rank += 1) {
      const created = await coach
        .post(`/plan-weeks/${weekId}/sessions`)
        .send({ scheduledDate: monday, title: `Séance ${rank}` });
      expect(created.status).toBe(201);
      sessionIds.push(created.body.id);
    }

    return { coach, athlete, planId: plan.body.id, weekId, sessionIds };
  }

  const tuesday = new Date(`${monday}T00:00:00Z`);
  tuesday.setUTCDate(tuesday.getUTCDate() + 1);
  const tuesdayIso = tuesday.toISOString().slice(0, 10);

  /** Les titres d'un jour, dans l'ordre rendu par l'API. */
  async function titlesOn(day: Day, date = monday): Promise<string[]> {
    const plan = await day.coach.get(`/plans/${day.planId}`);
    return plan.body.weeks[0].sessions
      .filter((session: { scheduledDate: string }) => session.scheduledDate === date)
      .map((session: { title: string }) => session.title);
  }

  /** Ajoute une séance au jour voulu et rend son id. */
  async function addOn(day: Day, date: string, title: string): Promise<string> {
    const created = await day.coach
      .post(`/plan-weeks/${day.weekId}/sessions`)
      .send({ scheduledDate: date, title });
    expect(created.status).toBe(201);
    return created.body.id;
  }

  const reorder = (day: Day, sessionIds: string[]) =>
    day.coach.put(`/plan-weeks/${day.weekId}/days/${monday}/order`).send({ sessionIds });

  /**
   * L'échange de DEUX séances est le cas qui casse : passer l'une en position 0 avant que l'autre
   * ne l'ait libérée viole `@@unique([planWeekId, scheduledDate, position])` en cours de
   * transaction. C'est la raison d'être des deux passes.
   */
  it("échange deux séances sans buter sur l'unicité", async () => {
    const day = await dayOf("swap", 2);
    const [first, second] = day.sessionIds;

    const res = await reorder(day, [second as string, first as string]);

    expect(res.status).toBe(200);
    expect(await titlesOn(day)).toEqual(["Séance 2", "Séance 1"]);
  });

  it("réordonne trois séances, la dernière passant en tête", async () => {
    const day = await dayOf("three", 3);
    const [first, second, third] = day.sessionIds;

    expect((await reorder(day, [third as string, first as string, second as string])).status).toBe(
      200,
    );
    expect(await titlesOn(day)).toEqual(["Séance 3", "Séance 1", "Séance 2"]);
  });

  it("refuse une séance citée deux fois", async () => {
    const day = await dayOf("dup", 2);
    const [first] = day.sessionIds;

    expect((await reorder(day, [first as string, first as string])).status).toBe(400);
  });

  /**
   * Omettre une séance déjà posée ce jour-là ne dirait pas où elle va : elle garderait son rang
   * d'avant, donc doublons et trous. Vider une journée se fait en déplaçant ou en supprimant.
   */
  it("refuse d'omettre une séance déjà posée ce jour-là", async () => {
    const day = await dayOf("omit", 3);

    expect((await reorder(day, [day.sessionIds[0] as string])).status).toBe(400);
    expect(await titlesOn(day)).toEqual(["Séance 1", "Séance 2", "Séance 3"]);
  });

  // Une séance d'une AUTRE semaine (ou d'un autre coach, que le scope rend invisible) n'a rien à
  // faire dans cette journée : la déplacer là franchirait une frontière que le glisser n'offre pas.
  it("refuse une séance étrangère à la semaine", async () => {
    const day = await dayOf("foreign", 2);
    const other = await dayOf("foreign-other", 1);

    const res = await reorder(day, [...day.sessionIds, other.sessionIds[0] as string]);

    expect(res.status).toBe(400);
    expect(await titlesOn(day)).toEqual(["Séance 1", "Séance 2"]);
  });

  describe("le déplacement d'un jour à l'autre", () => {
    /**
     * Le cœur de #93 élargi : le tableau DÉFINIT ce que la journée porte. Une séance du mardi qui
     * y figure est déplacée au lundi, au rang exact où elle est placée — pas en fin de file.
     */
    it("accueille une séance d'un autre jour au rang exact", async () => {
      const day = await dayOf("move-in", 2);
      const fromTuesday = await addOn(day, tuesdayIso, "Mardi");

      const res = await reorder(day, [
        day.sessionIds[0] as string,
        fromTuesday,
        day.sessionIds[1] as string,
      ]);

      expect(res.status).toBe(200);
      expect(await titlesOn(day)).toEqual(["Séance 1", "Mardi", "Séance 2"]);
      expect(await titlesOn(day, tuesdayIso)).toEqual([]);
    });

    // Le jour d'origine se recolle : sans ça il garde un trou, et la prochaine séance qu'on y
    // ajoute retombe sur un rang pris (le bug fermé par `compactDay`).
    it("recolle le jour quitté, qui reste ajoutable", async () => {
      const day = await dayOf("move-out", 1);
      const first = await addOn(day, tuesdayIso, "Mardi 1");
      await addOn(day, tuesdayIso, "Mardi 2");
      await addOn(day, tuesdayIso, "Mardi 3");

      expect((await reorder(day, [first, day.sessionIds[0] as string])).status).toBe(200);

      expect(await titlesOn(day)).toEqual(["Mardi 1", "Séance 1"]);
      expect(await titlesOn(day, tuesdayIso)).toEqual(["Mardi 2", "Mardi 3"]);
      await addOn(day, tuesdayIso, "Mardi 4");
      expect(await titlesOn(day, tuesdayIso)).toEqual(["Mardi 2", "Mardi 3", "Mardi 4"]);
    });

    // Une journée VIDE accueille : c'est le cas le plus courant du glisser, et `parking` doit
    // savoir se passer d'un maximum qui n'existe pas.
    it("accueille une séance dans une journée vide", async () => {
      const day = await dayOf("move-empty", 1);

      const res = await day.coach
        .put(`/plan-weeks/${day.weekId}/days/${tuesdayIso}/order`)
        .send({ sessionIds: day.sessionIds });

      expect(res.status).toBe(200);
      expect(await titlesOn(day)).toEqual([]);
      expect(await titlesOn(day, tuesdayIso)).toEqual(["Séance 1"]);
    });
  });

  /**
   * Isolation : le scope tenant rend la séance de l'autre coach invisible AVANT tout contrôle
   * applicatif — elle n'est donc pas « refusée », elle n'existe pas pour cette requête. La semaine
   * visée, elle, rend 404 pour la même raison.
   */
  it("ne laisse pas un coach réordonner la journée d'un autre", async () => {
    const mine = await dayOf("mine", 2);
    const theirs = await dayOf("theirs", 2);

    const res = await theirs.coach
      .put(`/plan-weeks/${mine.weekId}/days/${monday}/order`)
      .send({ sessionIds: [mine.sessionIds[1] as string, mine.sessionIds[0] as string] });

    expect(res.status).toBe(404);
    expect(await titlesOn(mine)).toEqual(["Séance 1", "Séance 2"]);
  });

  it("ferme la route à un athlète", async () => {
    const day = await dayOf("closed", 2);

    const res = await day.athlete
      .put(`/plan-weeks/${day.weekId}/days/${monday}/order`)
      .send({ sessionIds: day.sessionIds });

    expect(res.status).toBe(403);
  });

  describe("sur un cycle diffusé", () => {
    const reordered = async (agent: Agent) =>
      ((await agent.get("/me/notifications")).body as { type: string }[]).filter(
        (notification) => notification.type === "PLAN_SESSIONS_REORDERED",
      );

    /**
     * Réordonner reste AUTORISÉ sur un cycle diffusé, et n'émet qu'une notification pour la
     * journée — pas une par séance déplacée. C'est possible ici et ça ne l'était pas pour le
     * collage de semaine (#4) parce que la route est UN geste, pas N écritures.
     */
    it("prévient l'athlète une seule fois, en nommant le jour", async () => {
      const day = await dayOf("published", 3);
      expect([200, 201]).toContain((await billAndPublish(day.coach, day.planId)).status);
      const [first, second, third] = day.sessionIds;

      expect(
        (await reorder(day, [third as string, second as string, first as string])).status,
      ).toBe(200);

      const notifications = await reordered(day.athlete);
      expect(notifications).toHaveLength(1);
      // Le sujet est la DATE brute : le centre la met en forme dans la langue du lecteur.
      expect(notifications[0]).toMatchObject({
        entityType: "PLAN",
        entityId: day.planId,
        subjectLabel: monday,
      });
    });

    /**
     * Le `PUT` est idempotent : la comparaison porte sur les rangs RÉSULTANTS, jamais sur le fait
     * qu'une requête soit passée. Renvoyer l'ordre déjà en place ne dérange personne.
     */
    it("ne prévient personne quand l'ordre ne change pas", async () => {
      const day = await dayOf("noop", 3);
      expect([200, 201]).toContain((await billAndPublish(day.coach, day.planId)).status);

      expect((await reorder(day, day.sessionIds)).status).toBe(200);

      expect(await reordered(day.athlete)).toHaveLength(0);
    });

    /**
     * Une séance DÉPLACÉE prime sur l'ordre. Annoncer « séances réordonnées » quand la séance est
     * passée au mardi enverrait l'athlète la chercher au mauvais endroit — et c'est déjà ce que
     * dit le sélecteur « Jour » du panneau : même geste, même annonce.
     */
    it("annonce un déplacement comme une séance modifiée, pas comme un réordonnancement", async () => {
      const day = await dayOf("moved-notif", 1);
      expect([200, 201]).toContain((await billAndPublish(day.coach, day.planId)).status);
      const fromTuesday = await addOn(day, tuesdayIso, "Mardi");

      expect((await reorder(day, [fromTuesday, day.sessionIds[0] as string])).status).toBe(200);

      expect(await reordered(day.athlete)).toHaveLength(0);
      const updated = (
        (await day.athlete.get("/me/notifications")).body as {
          type: string;
          subjectLabel: string | null;
        }[]
      ).filter((notification) => notification.type === "PLAN_UPDATED");
      expect(updated).toHaveLength(1);
      expect(updated[0]?.subjectLabel).toBe("Mardi");
    });

    // Sur un BROUILLON il n'y a rien à annoncer : le cycle n'existe pas encore pour l'athlète.
    it("n'annonce rien sur un brouillon", async () => {
      const day = await dayOf("draft", 2);
      const [first, second] = day.sessionIds;

      expect((await reorder(day, [second as string, first as string])).status).toBe(200);

      expect(await reordered(day.athlete)).toHaveLength(0);
    });
  });
});
