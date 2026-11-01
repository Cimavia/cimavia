import {
  BLOCK_MAX_EXERCISES,
  ProblemType,
  Role,
  SESSION_MAX_EXERCISES,
  SESSION_TOO_MANY_EXERCISES_MESSAGE,
} from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { API_BODY_LIMIT_BYTES } from "../../src/app.setup";
import { type Agent, billAndPublish, inviteFor, signUp, signUpWith } from "../support/actors";
import { blocksOf, seriesBlock } from "../support/blocks";
import { fromTemplate, mondayOfCurrentWeek } from "../support/fixtures";
import {
  ANY_VERSION,
  atWeekVersion,
  deleteAtLatest,
  putAtLatest,
  versionOf,
  weekVersionOf,
} from "../support/version";

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

  /** `count` lignes citant `exerciseId`, rangées en blocs pleins : un bloc en compte au plus 20. */
  function linesOf(exerciseId: string, count: number) {
    const keys = Array.from({ length: count }, (_, index) => `e${index}`);
    const blocks = [];
    for (let start = 0; start < count; start += BLOCK_MAX_EXERCISES) {
      const chunk = keys.slice(start, start + BLOCK_MAX_EXERCISES);
      blocks.push(seriesBlock(chunk.map((key) => ({ key, exerciseId }))));
    }
    return blocks;
  }

  it("crée une séance avec une composition ordonnée (positions + note)", async () => {
    const res = await coachA.post("/sessions").send({
      title: "Bloc force max",
      notes: "Repos 3 min entre séries.",
      blocks: blocksOf(
        { exerciseId: exA1, note: "10 min mobilité" },
        { exerciseId: exA2, note: "5×5 à +10 kg" },
      ),
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
      blocks: blocksOf(exB),
    });
    expect(res.status).toBe(400);
  });

  /** Le même exercice cité à chaque ligne (#297) : au plafond exact, une composition légitime. */
  it(`accepte ${SESSION_MAX_EXERCISES} lignes citant le même exercice`, async () => {
    const res = await coachA.put(`/sessions/${sessionAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/sessions/${sessionAId}`),
      title: "Bloc force max",
      blocks: linesOf(exA1, SESSION_MAX_EXERCISES),
    });
    expect(res.status).toBe(200);
    expect(res.body.exercises).toHaveLength(SESSION_MAX_EXERCISES);
    expect(res.body.exercises.at(-1)).toMatchObject({
      exerciseId: exA1,
      position: SESSION_MAX_EXERCISES - 1,
    });
  });

  it("refuse un exercice de plus que le plafond (400), sans rien écrire", async () => {
    const tooMany = linesOf(exA1, SESSION_MAX_EXERCISES + 1);

    const updated = await coachA.put(`/sessions/${sessionAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/sessions/${sessionAId}`),
      title: "Trop long",
      blocks: tooMany,
    });
    expect(updated.status).toBe(400);
    expect(updated.headers["content-type"]).toContain("application/problem+json");
    expect(updated.body.errors).toContainEqual({
      pointer: "#/blocks",
      detail: SESSION_TOO_MANY_EXERCISES_MESSAGE,
    });
    const reread = await coachA.get(`/sessions/${sessionAId}`);
    expect(reread.body.title).toBe("Bloc force max");
    expect(reread.body.exercises).toHaveLength(SESSION_MAX_EXERCISES);

    const created = await coachA.post("/sessions").send({ title: "Trop long", blocks: tooMany });
    expect(created.status).toBe(400);
    expect((await coachA.get("/sessions")).body).toHaveLength(1);
  });

  // Le corps est refusé avant d'être parsé : aucun schéma n'a à juger ce qui ne tient pas.
  it("refuse un corps au-delà du plafond de l'API (413)", async () => {
    const res = await coachA
      .post("/sessions")
      .send({ title: "Trop lourd", notes: "x".repeat(API_BODY_LIMIT_BYTES) });
    expect(res.status).toBe(413);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect((await coachA.get("/sessions")).body).toHaveLength(1);
  });

  it("met à jour la séance en remplaçant intégralement la composition (replace-all)", async () => {
    const res = await coachA.put(`/sessions/${sessionAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/sessions/${sessionAId}`),
      title: "Bloc force max (v2)",
      notes: null,
      blocks: blocksOf({ exerciseId: exA2, note: "4×6" }),
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
      (
        await coachB.put(`/sessions/${sessionAId}`).send({
          expectedUpdatedAt: await versionOf(coachA, `/sessions/${sessionAId}`),
          title: "x",
          blocks: [],
        })
      ).status,
    ).toBe(404);
    expect(
      (await coachB.delete(`/sessions/${sessionAId}`).query({ expectedUpdatedAt: ANY_VERSION }))
        .status,
    ).toBe(404);
  });

  it("un athlète n'a aucun accès aux séances (route coach)", async () => {
    expect((await athlete.get("/sessions")).status).toBe(403);
  });

  // SessionExercise.exercise est en onDelete: Restrict → sans garde applicative, la suppression
  // remonterait une violation de clé étrangère (500) au lieu d'un refus explicite.
  it("supprimer un exercice utilisé dans une séance est refusé (409), puis autorisé une fois retiré", async () => {
    // exA2 est encore dans la séance (replace-all précédent).
    const conflict = await deleteAtLatest(coachA, `/exercises/${exA2}`);
    expect(conflict.status).toBe(409);

    // On vide la composition → l'exercice n'est plus référencé.
    const emptied = await coachA.put(`/sessions/${sessionAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/sessions/${sessionAId}`),
      title: "Bloc force max (v2)",
      notes: null,
      blocks: [],
    });
    expect(emptied.status).toBe(200);

    expect((await deleteAtLatest(coachA, `/exercises/${exA2}`)).status).toBe(204);
  });

  it("supprimer une séance est possible et laisse les exercices intacts", async () => {
    expect((await deleteAtLatest(coachA, `/sessions/${sessionAId}`)).status).toBe(204);
    expect((await coachA.get("/sessions")).body).toHaveLength(0);
    // exA1 n'était plus dans la séance mais existe toujours en bibliothèque.
    expect((await coachA.get(`/exercises/${exA1}`)).status).toBe(200);
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
    const created = await coach.post(`/plan-weeks/${weekId}/sessions`).send(
      await fromTemplate(coach, {
        scheduledDate: date,
        title,
      }),
    );
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

    expect((await deleteAtLatest(coach, `/scheduled-sessions/${first}`)).status).toBe(204);
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

    const moved = await putAtLatest(coach, `/scheduled-sessions/${first}`, {
      title: "Lundi 1",
      scheduledDate: tuesdayIso,
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
        .send(await fromTemplate(coach, { scheduledDate: monday, title: `Séance ${rank}` }));
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
      .send(await fromTemplate(day.coach, { scheduledDate: date, title }));
    expect(created.status).toBe(201);
    return created.body.id;
  }

  const reorder = async (day: Day, sessionIds: string[], date = monday) =>
    day.coach
      .put(`/plan-weeks/${day.weekId}/days/${date}/order`)
      .send(await atWeekVersion(day.coach, day.planId, day.weekId, { sessionIds }));

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

  // Une séance d'un autre coach, que le scope rend invisible, n'a rien à faire dans cette journée :
  // pour cette requête, elle n'existe pas. Celle d'un autre cycle du MÊME coach : voir #689 plus bas.
  it("refuse la séance d'un autre coach", async () => {
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

      const res = await reorder(day, day.sessionIds, tuesdayIso);

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

    // Même en citant la bonne version : le scope répond avant elle (#604).
    const res = await theirs.coach.put(`/plan-weeks/${mine.weekId}/days/${monday}/order`).send(
      await atWeekVersion(mine.coach, mine.planId, mine.weekId, {
        sessionIds: [mine.sessionIds[1] as string, mine.sessionIds[0] as string],
      }),
    );

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

describe("Déplacer une séance vers une autre semaine du cycle (#689)", () => {
  const monday = mondayOfCurrentWeek();

  /** La date `days` jours après `iso`. */
  function shift(iso: string, days: number): string {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  // Le lundi de la S1, le jeudi de la S3 : deux jours de deux semaines différentes du cycle.
  const s1Monday = monday;
  const s3Thursday = shift(monday, 2 * 7 + 3);

  type Cycle = {
    coach: Agent;
    athlete: Agent;
    athleteId: string;
    planId: string;
    weekIds: string[];
  };

  /** Un coach, son athlète, et un cycle de trois semaines. */
  async function cycleOf(slug: string): Promise<Cycle> {
    const coach = await signUpWith(`${slug}-coach@cmv.test`, { isCoach: true, isAthlete: false });
    const athlete = await signUp(`${slug}-athlete@cmv.test`, Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const athleteId = (await athlete.post(`/invitations/${invitation.body.id}/accept`)).body[0]
      .athleteId;
    return { coach, athlete, athleteId, ...(await planFor(coach, athleteId, `Cycle ${slug}`)) };
  }

  async function planFor(coach: Agent, athleteId: string, title: string) {
    const plan = await coach.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }, { type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    return {
      planId: plan.body.id as string,
      weekIds: plan.body.weeks.map((week: { id: string }) => week.id) as string[],
    };
  }

  async function addOn(cycle: Cycle, weekIndex: number, date: string, title: string) {
    const created = await cycle.coach
      .post(`/plan-weeks/${cycle.weekIds[weekIndex]}/sessions`)
      .send(await fromTemplate(cycle.coach, { scheduledDate: date, title }));
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  /** Ce que la semaine `weekIndex` porte ce jour-là : titres et rangs, dans l'ordre de l'API. */
  async function dayIn(cycle: Cycle, weekIndex: number, date: string) {
    const plan = await cycle.coach.get(`/plans/${cycle.planId}`);
    const sessions = (
      plan.body.weeks[weekIndex].sessions as {
        title: string;
        position: number;
        scheduledDate: string;
      }[]
    ).filter((session) => session.scheduledDate === date);
    return {
      titles: sessions.map((session) => session.title),
      positions: sessions.map((session) => session.position),
    };
  }

  /** Écrit le jeudi de la S3, en citant la version de la S3 — celle que le client a lue. */
  const orderS3Thursday = async (cycle: Cycle, sessionIds: string[], agent = cycle.coach) =>
    agent
      .put(`/plan-weeks/${cycle.weekIds[2]}/days/${s3Thursday}/order`)
      .send(
        await atWeekVersion(cycle.coach, cycle.planId, cycle.weekIds[2] as string, { sessionIds }),
      );

  describe("par la route d'ordre", () => {
    it("accueille une séance de la S1 au rang exact du jeudi de la S3", async () => {
      const cycle = await cycleOf("cross-rank");
      const first = await addOn(cycle, 2, s3Thursday, "Jeudi 1");
      const second = await addOn(cycle, 2, s3Thursday, "Jeudi 2");
      const moved = await addOn(cycle, 0, s1Monday, "Lundi S1");

      expect((await orderS3Thursday(cycle, [first, moved, second])).status).toBe(200);

      expect(await dayIn(cycle, 2, s3Thursday)).toEqual({
        titles: ["Jeudi 1", "Lundi S1", "Jeudi 2"],
        positions: [0, 1, 2],
      });
      expect((await dayIn(cycle, 0, s1Monday)).titles).toEqual([]);
    });

    // Le jour quitté se recolle DANS SA semaine : un trou y ferait échouer le prochain ajout.
    it("recolle le jour quitté dans la semaine de départ, qui reste ajoutable", async () => {
      const cycle = await cycleOf("cross-compact");
      const leaving = await addOn(cycle, 0, s1Monday, "Lundi 1");
      await addOn(cycle, 0, s1Monday, "Lundi 2");

      expect((await orderS3Thursday(cycle, [leaving])).status).toBe(200);

      expect(await dayIn(cycle, 0, s1Monday)).toEqual({ titles: ["Lundi 2"], positions: [0] });
      await addOn(cycle, 0, s1Monday, "Lundi 3");
      expect((await dayIn(cycle, 0, s1Monday)).positions).toEqual([0, 1]);
    });

    // Changer de cycle peut changer d'athlète, donc de destinataire : hors du périmètre.
    it("refuse une séance d'un autre cycle du même coach", async () => {
      const cycle = await cycleOf("cross-plan");
      const other = await planFor(cycle.coach, cycle.athleteId, "Autre cycle");
      const foreign = (
        await cycle.coach
          .post(`/plan-weeks/${other.weekIds[0]}/sessions`)
          .send(await fromTemplate(cycle.coach, { scheduledDate: s1Monday, title: "Autre cycle" }))
      ).body.id as string;

      expect((await orderS3Thursday(cycle, [foreign])).status).toBe(400);
      expect((await dayIn(cycle, 2, s3Thursday)).titles).toEqual([]);
    });

    it("ne laisse pas un coach tirer la séance d'un autre dans son cycle", async () => {
      const mine = await cycleOf("cross-mine");
      const theirs = await cycleOf("cross-theirs");
      const target = await addOn(mine, 0, s1Monday, "À moi");

      expect((await orderS3Thursday(theirs, [target])).status).toBe(400);
      expect((await dayIn(mine, 0, s1Monday)).titles).toEqual(["À moi"]);
    });

    it("annonce le déplacement par un seul PLAN_UPDATED sur un cycle diffusé", async () => {
      const cycle = await cycleOf("cross-notif");
      const moved = await addOn(cycle, 0, s1Monday, "Lundi S1");
      expect([200, 201]).toContain((await billAndPublish(cycle.coach, cycle.planId)).status);

      expect((await orderS3Thursday(cycle, [moved])).status).toBe(200);

      const notifications = (
        (await cycle.athlete.get("/me/notifications")).body as {
          type: string;
          subjectLabel: string | null;
        }[]
      ).filter((notification) => notification.type.startsWith("PLAN_"));
      expect(notifications.filter((n) => n.type === "PLAN_UPDATED")).toHaveLength(1);
      expect(notifications.filter((n) => n.type === "PLAN_SESSIONS_REORDERED")).toHaveLength(0);
    });

    it("répond 409 sur une version périmée de la semaine d'arrivée, sans rien déplacer", async () => {
      const cycle = await cycleOf("cross-stale-arrival");
      const moved = await addOn(cycle, 0, s1Monday, "Lundi S1");
      const read = await atWeekVersion(cycle.coach, cycle.planId, cycle.weekIds[2] as string, {
        sessionIds: [moved],
      });
      // Un autre geste sur la S3 la fait avancer après la lecture.
      await addOn(cycle, 2, shift(s3Thursday, 1), "Vendredi S3");

      const res = await cycle.coach
        .put(`/plan-weeks/${cycle.weekIds[2]}/days/${s3Thursday}/order`)
        .send(read);

      expect(res.status).toBe(409);
      expect(res.body.type).toBe(ProblemType.STALE_WRITE);
      expect((await dayIn(cycle, 0, s1Monday)).titles).toEqual(["Lundi S1"]);
    });

    // La semaine de départ n'est pas citée, mais elle change : un Coach qui l'a ouverte AVANT le
    // déplacement doit recevoir un 409 plutôt qu'écraser ce qu'il n'a pas vu.
    it("fait avancer la semaine de départ : un geste fondé sur sa version d'avant prend 409", async () => {
      const cycle = await cycleOf("cross-stale-departure");
      const moved = await addOn(cycle, 0, s1Monday, "Lundi S1");
      const departureRead = await weekVersionOf(
        cycle.coach,
        cycle.planId,
        cycle.weekIds[0] as string,
      );

      expect((await orderS3Thursday(cycle, [moved])).status).toBe(200);

      const res = await cycle.coach
        .patch(`/plan-weeks/${cycle.weekIds[0]}`)
        .send({ type: "DELOAD", expectedUpdatedAt: departureRead });
      expect(res.status).toBe(409);
      expect(res.body.type).toBe(ProblemType.STALE_WRITE);
    });

    /**
     * Deux déplacements en sens inverse touchent les mêmes deux semaines. Verrouillées dans l'ordre
     * du geste, chacun tiendrait celle que l'autre attend : Postgres en tuerait un d'un 500. Dans
     * l'ordre des numéros, le second attend, puis prend le 409 de sa version périmée.
     */
    it("sérialise deux déplacements croisés, sans interblocage", async () => {
      const cycle = await cycleOf("cross-deadlock");
      const fromS1 = await addOn(cycle, 0, s1Monday, "Lundi S1");
      const fromS3 = await addOn(cycle, 2, s3Thursday, "Jeudi S3");

      const toS3 = await atWeekVersion(cycle.coach, cycle.planId, cycle.weekIds[2] as string, {
        sessionIds: [fromS3, fromS1],
      });
      const toS1 = await atWeekVersion(cycle.coach, cycle.planId, cycle.weekIds[0] as string, {
        sessionIds: [fromS3, fromS1],
      });
      const [first, second] = await Promise.all([
        cycle.coach.put(`/plan-weeks/${cycle.weekIds[2]}/days/${s3Thursday}/order`).send(toS3),
        cycle.coach.put(`/plan-weeks/${cycle.weekIds[0]}/days/${s1Monday}/order`).send(toS1),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
    });
  });

  describe("par le panneau de séance", () => {
    it("accepte une date d'une autre semaine : la séance y part, en fin de file", async () => {
      const cycle = await cycleOf("cross-update");
      await addOn(cycle, 2, s3Thursday, "Jeudi S3");
      const moved = await addOn(cycle, 0, s1Monday, "Lundi S1");

      const res = await putAtLatest(cycle.coach, `/scheduled-sessions/${moved}`, {
        title: "Lundi S1",
        scheduledDate: s3Thursday,
      });

      expect(res.status).toBe(200);
      expect(await dayIn(cycle, 2, s3Thursday)).toEqual({
        titles: ["Jeudi S3", "Lundi S1"],
        positions: [0, 1],
      });
      expect((await dayIn(cycle, 0, s1Monday)).titles).toEqual([]);
    });

    it("refuse une date hors du cycle (400), et la séance reste où elle était", async () => {
      const cycle = await cycleOf("cross-update-out");
      const session = await addOn(cycle, 0, s1Monday, "Lundi S1");

      for (const scheduledDate of [shift(monday, 3 * 7), shift(monday, -1)]) {
        const res = await putAtLatest(cycle.coach, `/scheduled-sessions/${session}`, {
          title: "Lundi S1",
          scheduledDate,
        });
        expect(res.status).toBe(400);
      }
      expect((await dayIn(cycle, 0, s1Monday)).titles).toEqual(["Lundi S1"]);
    });
  });
});

describe("Séance modèle — version lue (#604)", () => {
  let coach: Agent;
  let other: Agent;
  let exerciseId: string;
  let sessionId: string;

  const path = () => `/sessions/${sessionId}`;
  const current = async () => (await coach.get(path())).body;
  /** La composition renvoyée telle quelle : seul le titre change. */
  const save = (title: string, expectedUpdatedAt: string) =>
    coach.put(path()).send({ title, blocks: blocksOf(exerciseId), expectedUpdatedAt });

  beforeAll(async () => {
    coach = await signUp("session-version-coach@cmv.test", Role.COACH);
    other = await signUp("session-version-other@cmv.test", Role.COACH);
    exerciseId = (await coach.post("/exercises").send({ title: "Tractions" })).body.id;
    const created = await coach
      .post("/sessions")
      .send({ title: "Force", blocks: blocksOf(exerciseId) });
    sessionId = created.body.id;
  });

  it("écrit quand la version lue est la dernière, et la fait avancer", async () => {
    const before = await current();
    const write = await save("Force (v2)", before.updatedAt);

    expect(write.status).toBe(200);
    expect(write.body.updatedAt).not.toBe(before.updatedAt);
  });

  it("refuse une écriture fondée sur une version périmée, et la base garde la première", async () => {
    const read = await current();
    expect((await save("Écrit dans l'onglet 1", read.updatedAt)).status).toBe(200);
    const kept = await current();

    const stale = await coach
      .put(path())
      .send({ title: "Écrit dans l'onglet 2", blocks: [], expectedUpdatedAt: read.updatedAt });

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
    // Ni le titre, ni la composition qu'elle aurait vidée.
    expect(await current()).toEqual(kept);
  });

  it("ne laisse passer qu'une écriture sur deux lancées ensemble", async () => {
    const read = await current();
    const [first, second] = await Promise.all([
      save("Course A", read.updatedAt),
      save("Course B", read.updatedAt),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  it("refuse une écriture qui ne dit pas quelle version elle a lue", async () => {
    const before = await current();
    const write = await coach.put(path()).send({ title: "Sans version", blocks: [] });

    expect(write.status).toBe(400);
    expect(await current()).toEqual(before);
  });

  // Un 409 apprendrait à l'autre coach que la séance existe.
  it("répond 404 à un autre coach, même muni de la dernière version", async () => {
    const read = await current();

    expect(
      (
        await other
          .put(path())
          .send({ title: "Intrusion", blocks: [], expectedUpdatedAt: read.updatedAt })
      ).status,
    ).toBe(404);
    expect(await current()).toEqual(read);
  });

  it("répond 404 sur une séance supprimée, même munie de sa dernière version", async () => {
    const doomed = await coach.post("/sessions").send({ title: "À supprimer" });
    expect((await deleteAtLatest(coach, `/sessions/${doomed.body.id}`)).status).toBe(204);

    const write = await coach
      .put(`/sessions/${doomed.body.id}`)
      .send({ title: "Trop tard", blocks: [], expectedUpdatedAt: doomed.body.updatedAt });

    expect(write.status).toBe(404);
  });
});
