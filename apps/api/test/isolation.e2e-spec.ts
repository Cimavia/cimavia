import { mondayOfIsoWeek, Role } from "@cmv/shared";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/infra/prisma/prisma.service";

const TABLES = [
  "feedback_media",
  "session_feedback",
  "push_token",
  "scheduled_session_exercise_document",
  "scheduled_session_exercise",
  "scheduled_session",
  "plan_week",
  "plan",
  "session_exercise",
  "exercise_document",
  "sessions",
  "exercise",
  "athlete_sheet",
  "coach_invitation",
  "coach_athlete",
  "session",
  "account",
  "verification",
  "user",
];

const PASSWORD = "password123";

type Agent = ReturnType<typeof request.agent>;

let app: NestFastifyApplication;
let baseURL: string;

async function signUp(email: string, role: string): Promise<Agent> {
  const agent = request.agent(baseURL);
  const res = await agent
    .post("/api/auth/sign-up/email")
    .send({ name: email, email, password: PASSWORD, role });
  expect([200, 201]).toContain(res.status);
  return agent;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    bodyParser: false,
  });
  // Même configuration HTTP que main.ts (pipe de validation Zod) — sinon les e2e tourneraient
  // sans validation d'entrée et ne testeraient pas le comportement réel de l'API.
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
  );

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  baseURL = `http://localhost:${port}`;
});

afterAll(async () => {
  await app?.close();
});

describe("Isolation multi-tenant (P1)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let athleteB1: Agent;
  let athleteC: Agent;
  let coachAId: string;
  let a1Id: string;
  let b1Id: string;

  beforeAll(async () => {
    coachA = await signUp("coach-a@cmv.test", Role.COACH);
    coachB = await signUp("coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("athlete-a1@cmv.test", Role.ATHLETE);
    athleteB1 = await signUp("athlete-b1@cmv.test", Role.ATHLETE);
    athleteC = await signUp("athlete-c@cmv.test", Role.ATHLETE);

    // Liaison A1 → coach A par invitation.
    const invA = await coachA.post("/invitations").send({});
    expect(invA.status).toBe(201);
    const acceptA = await athleteA1.post("/invitations/accept").send({ code: invA.body.code });
    expect(acceptA.status).toBe(201);
    a1Id = acceptA.body.athleteId;
    coachAId = acceptA.body.coachId;

    // Liaison B1 → coach B.
    const invB = await coachB.post("/invitations").send({});
    const acceptB = await athleteB1.post("/invitations/accept").send({ code: invB.body.code });
    b1Id = acceptB.body.athleteId;
  });

  it("un coach ne voit que SES athlètes, avec leur nom (pas un id opaque)", async () => {
    const res = await coachA.get("/athletes");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].athleteId).toBe(a1Id);
    // `signUp` inscrit le compte avec l'e-mail comme nom.
    expect(res.body[0].athleteName).toBe("athlete-a1@cmv.test");
    expect(res.body[0].coachName).toBe("coach-a@cmv.test");
  });

  it("un athlète lié voit SON coach ; un athlète autonome n'en a aucun", async () => {
    const mine = await athleteA1.get("/me/coach");
    expect(mine.status).toBe(200);
    expect(mine.body.coachId).toBe(coachAId);

    const none = await athleteC.get("/me/coach");
    expect(none.status).toBe(200);
    expect(none.body).toBeNull();
  });

  it("un coach ne peut PAS lire la fiche d'un athlète d'un autre coach", async () => {
    const res = await coachA.get(`/athletes/${b1Id}/sheet`);
    expect(res.status).toBe(404);
  });

  it("un coach ne peut PAS écrire la fiche d'un athlète d'un autre coach", async () => {
    const res = await coachA.put(`/athletes/${b1Id}/sheet`).send({ content: "intrusion" });
    expect(res.status).toBe(404);
  });

  it("la fiche écrite par un coach reste invisible à l'autre coach", async () => {
    const write = await coachA.put(`/athletes/${a1Id}/sheet`).send({ content: "objectif 8a" });
    expect(write.status).toBe(200);
    expect(write.body.content).toBe("objectif 8a");

    const readOwn = await coachA.get(`/athletes/${a1Id}/sheet`);
    expect(readOwn.body.content).toBe("objectif 8a");

    const readOther = await coachB.get(`/athletes/${a1Id}/sheet`);
    expect(readOther.status).toBe(404);
  });

  it("le rôle gouverne l'accès : athlète ≠ coach", async () => {
    // Un athlète ne peut pas émettre d'invitation (route coach).
    expect((await athleteA1.post("/invitations").send({})).status).toBe(403);
    // Un coach ne peut pas accepter d'invitation (route athlète).
    expect((await coachA.post("/invitations/accept").send({ code: "x" })).status).toBe(403);
    // Un athlète autonome ne peut pas agir comme coach.
    expect((await athleteC.get("/athletes")).status).toBe(403);
  });

  it("un athlète déjà lié ne peut pas rejoindre un second coach", async () => {
    const inv = await coachB.post("/invitations").send({});
    const res = await athleteA1.post("/invitations/accept").send({ code: inv.body.code });
    expect(res.status).toBe(409);
  });

  it("une requête non authentifiée est refusée", async () => {
    const res = await request(baseURL).get("/athletes");
    expect(res.status).toBe(401);
  });

  // Le défaut de la couche CORS ne renvoie que GET,HEAD,POST : sans `methods` explicite, tout
  // PATCH/PUT/DELETE légitime est bloqué en preflight côté navigateur (invisible en supertest).
  it("CORS : le preflight autorise les méthodes d'écriture depuis le web", async () => {
    const res = await request(baseURL)
      .options("/sessions/whatever")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "PUT");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    const allowed = res.headers["access-control-allow-methods"] ?? "";
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
      expect(allowed).toContain(method);
    }
  });
});

describe("Isolation bibliothèque d'exercices (P2)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athlete: Agent;
  let exerciseAId: string;

  beforeAll(async () => {
    coachA = await signUp("ex-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("ex-coach-b@cmv.test", Role.COACH);
    athlete = await signUp("ex-athlete@cmv.test", Role.ATHLETE);

    const created = await coachA.post("/exercises").send({
      title: "Gainage dynamique",
      description: "4×45 s",
      category: "RENFO",
    });
    expect(created.status).toBe(201);
    exerciseAId = created.body.id;
    expect(typeof created.body.coachId).toBe("string");
    expect(created.body.documents).toEqual([]);
  });

  it("un coach ne liste que SES exercices", async () => {
    const own = await coachA.get("/exercises");
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0].id).toBe(exerciseAId);

    const other = await coachB.get("/exercises");
    expect(other.body).toHaveLength(0);
  });

  it("un coach ne peut PAS lire l'exercice d'un autre coach", async () => {
    const res = await coachB.get(`/exercises/${exerciseAId}`);
    expect(res.status).toBe(404);
  });

  it("un coach ne peut PAS modifier ni supprimer l'exercice d'un autre coach", async () => {
    const patch = await coachB.patch(`/exercises/${exerciseAId}`).send({ title: "intrusion" });
    expect(patch.status).toBe(404);
    const del = await coachB.delete(`/exercises/${exerciseAId}`);
    expect(del.status).toBe(404);
    const still = await coachA.get(`/exercises/${exerciseAId}`);
    expect(still.body.title).toBe("Gainage dynamique");
  });

  it("un athlète n'a aucun accès à la bibliothèque (route coach)", async () => {
    expect((await athlete.get("/exercises")).status).toBe(403);
    expect((await athlete.post("/exercises").send({ title: "x", category: "RENFO" })).status).toBe(
      403,
    );
  });

  it("attache un document LINK, visible dans le détail de l'exercice", async () => {
    const attached = await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://youtu.be/demo" });
    expect(attached.status).toBe(201);
    expect(attached.body.type).toBe("LINK");
    expect(attached.body.url).toBe("https://youtu.be/demo");
    expect(attached.body.fileName).toBeNull();

    const detail = await coachA.get(`/exercises/${exerciseAId}`);
    expect(detail.body.documents).toHaveLength(1);
    expect(detail.body.documents[0].id).toBe(attached.body.id);
  });

  it("un coach ne peut PAS agir sur les documents de l'exercice d'un autre coach", async () => {
    const attach = await coachB
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://x.test" });
    expect(attach.status).toBe(404);

    const uploadUrl = await coachB
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "a.pdf", mimeType: "application/pdf", size: 1000 });
    expect(uploadUrl.status).toBe(404);
  });

  // Le fail-closed « storage non configuré → 503 » est couvert par le test unitaire de
  // StorageService : les e2e tournent désormais avec le MinIO du docker-compose, sans quoi le
  // flux médias de P4 (upload signé → rattachement → purge) ne serait pas testable.
  it("URL d'upload : signée sur le bucket privé", async () => {
    const res = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "demo.pdf", mimeType: "application/pdf", size: 1000 });
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toContain("X-Amz-Signature");
    expect(res.body.storagePath).toContain(`/exercises/${exerciseAId}/`);
  });

  it("URL d'upload : type MIME et taille validés par le schéma partagé (400)", async () => {
    // Contraintes portées par requestUploadUrlSchema (@cmv/shared) → rejet AVANT le service.
    const badType = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "x.exe", mimeType: "application/x-msdownload", size: 1000 });
    expect(badType.status).toBe(400);

    const tooBig = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "gros.pdf", mimeType: "application/pdf", size: 50 * 1024 * 1024 });
    expect(tooBig.status).toBe(400);
  });

  it("le pipe de validation global est actif (titre vide, catégorie inconnue → 400)", async () => {
    expect((await coachA.post("/exercises").send({ title: "", category: "RENFO" })).status).toBe(
      400,
    );
    expect((await coachA.post("/exercises").send({ title: "x", category: "CARDIO" })).status).toBe(
      400,
    );
  });
});

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
    const res = await coach.post("/exercises").send({ title, category: "RENFO" });
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

  it("crée une séance avec une composition ordonnée (positions + prescription)", async () => {
    const res = await coachA.post("/sessions").send({
      title: "Bloc force max",
      notes: "Repos 3 min entre séries.",
      exercises: [
        { exerciseId: exA1, prescription: "10 min mobilité" },
        { exerciseId: exA2, prescription: "5×5 à +10 kg" },
      ],
    });
    expect(res.status).toBe(201);
    sessionAId = res.body.id;
    expect(res.body.exercises).toHaveLength(2);
    expect(res.body.exercises[0]).toMatchObject({
      exerciseId: exA1,
      position: 0,
      title: "Échauffement épaules",
      category: "RENFO",
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

  it("met à jour la séance en remplaçant intégralement la composition (replace-all)", async () => {
    const res = await coachA.put(`/sessions/${sessionAId}`).send({
      title: "Bloc force max (v2)",
      notes: null,
      exercises: [{ exerciseId: exA2, prescription: "4×6" }],
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

// Le cycle démarre TOUJOURS un lundi (planStartDateSchema) : on prend celui de la semaine en
// cours, pour que le plan diffusé soit bien le plan « courant » vu par l'athlète.
function mondayOfCurrentWeek(): string {
  const monday = mondayOfIsoWeek(new Date().toISOString().slice(0, 10));
  if (monday == null) throw new Error("[test] lundi de la semaine courante introuvable");
  return monday;
}

describe("Planifications : diffusion & isolation (P3)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let athleteB1: Agent;
  let a1Id: string;
  let b1Id: string;
  let exerciseAId: string;
  let exerciseBId: string;
  let templateId: string;
  let planId: string;
  let week1Id: string;
  let week2Id: string;
  let scheduledId: string;

  const monday = mondayOfCurrentWeek();

  // Lie un athlète à un coach par invitation et retourne son id.
  async function link(coach: Agent, athlete: Agent): Promise<string> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    expect(accepted.status).toBe(201);
    return accepted.body.athleteId;
  }

  beforeAll(async () => {
    coachA = await signUp("plan-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("plan-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("plan-athlete-a1@cmv.test", Role.ATHLETE);
    athleteB1 = await signUp("plan-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    b1Id = await link(coachB, athleteB1);

    // Bibliothèque du coach A : un exercice documenté, composé dans une séance modèle.
    const exercise = await coachA
      .post("/exercises")
      .send({ title: "Tractions lestées", description: "Prise large", category: "RENFO" });
    exerciseAId = exercise.body.id;
    await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://youtu.be/demo" });

    const template = await coachA.post("/sessions").send({
      title: "Bloc force max",
      notes: "Repos 3 min.",
      exercises: [{ exerciseId: exerciseAId, prescription: "5×5" }],
    });
    templateId = template.body.id;

    const exerciseB = await coachB.post("/exercises").send({ title: "Chez B", category: "GRIMPE" });
    exerciseBId = exerciseB.body.id;
  });

  it("crée un cycle avec ses semaines (type training/deload, nombre libre)", async () => {
    const res = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle bloc — automne",
      description: "Montée en charge puis décharge.",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "DELOAD", note: "volume -40 %" }],
    });
    expect(res.status).toBe(201);
    planId = res.body.id;
    week1Id = res.body.weeks[0].id;
    week2Id = res.body.weeks[1].id;

    expect(res.body.status).toBe("DRAFT");
    expect(res.body.weekCount).toBe(2);
    // Les bornes de semaine sont CALCULÉES à partir du lundi de départ (rien n'est stocké).
    expect(res.body.weeks[0].startDate).toBe(monday);
    expect(res.body.weeks[1].weekNumber).toBe(2);
    expect(res.body.weeks[1].type).toBe("DELOAD");
  });

  it("refuse un cycle qui ne démarre pas un lundi, ou pour l'athlète d'un autre coach", async () => {
    const notMonday = await coachA
      .post("/plans")
      .send({ athleteId: a1Id, title: "x", startDate: "2026-07-14" }); // mardi
    expect(notMonday.status).toBe(400);

    const otherAthlete = await coachA
      .post("/plans")
      .send({ athleteId: b1Id, title: "Intrusion", startDate: monday });
    expect(otherAthlete.status).toBe(400);
  });

  it("instancie une séance : la composition et les documents sont COPIÉS du modèle", async () => {
    const res = await coachA
      .post(`/plan-weeks/${week1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: monday });
    expect(res.status).toBe(201);
    scheduledId = res.body.id;

    expect(res.body.title).toBe("Bloc force max");
    expect(res.body.exercises).toHaveLength(1);
    expect(res.body.exercises[0]).toMatchObject({
      sourceExerciseId: exerciseAId,
      title: "Tractions lestées",
      category: "RENFO",
      prescription: "5×5",
      position: 0,
    });
    // Le document de l'exercice suit la copie : sans lui, l'athlète n'y aurait aucun accès.
    expect(res.body.exercises[0].documents).toHaveLength(1);
    expect(res.body.exercises[0].documents[0].url).toBe("https://youtu.be/demo");
  });

  it("refuse une séance hors de la plage de sa semaine, ou référençant l'exercice d'un autre coach", async () => {
    const outOfWeek = await coachA
      .post(`/plan-weeks/${week1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: "2027-01-04" });
    expect(outOfWeek.status).toBe(400);

    const foreignExercise = await coachA.post(`/plan-weeks/${week1Id}/sessions`).send({
      title: "Intrusion",
      scheduledDate: monday,
      exercises: [{ sourceExerciseId: exerciseBId, title: "Volé", category: "GRIMPE" }],
    });
    expect(foreignExercise.status).toBe(400);
  });

  it("éditer l'instance ne touche PAS le modèle de la bibliothèque", async () => {
    const edited = await coachA.put(`/scheduled-sessions/${scheduledId}`).send({
      title: "Bloc force max (ajusté)",
      notes: null,
      scheduledDate: monday,
      exercises: [
        {
          sourceExerciseId: exerciseAId,
          title: "Tractions lestées",
          category: "RENFO",
          prescription: "4×6 — épaule sensible",
        },
      ],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.exercises[0].prescription).toBe("4×6 — épaule sensible");

    const template = await coachA.get(`/sessions/${templateId}`);
    expect(template.body.title).toBe("Bloc force max");
    expect(template.body.exercises[0].prescription).toBe("5×5");
  });

  it("un brouillon est INVISIBLE de l'athlète (le scope tenant ne filtre pas le statut)", async () => {
    const plan = await athleteA1.get("/me/plan");
    expect(plan.status).toBe(200);
    expect(plan.body).toBeNull();

    // Même en connaissant l'id exact de la séance.
    expect((await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  it("un coach ne voit ni ne diffuse la planification d'un autre coach", async () => {
    expect((await coachB.get(`/plans/${planId}`)).status).toBe(404);
    expect((await coachB.post(`/plans/${planId}/publish`)).status).toBe(404);
    expect((await coachB.post(`/plans/${planId}/weeks`).send({ type: "TRAINING" })).status).toBe(
      404,
    );
    expect((await coachB.delete(`/plan-weeks/${week2Id}`)).status).toBe(404);
    expect((await coachB.get(`/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  it("refuse de diffuser un cycle sans semaine (rien à consulter)", async () => {
    const empty = await coachA
      .post("/plans")
      .send({ athleteId: a1Id, title: "Cycle vide", startDate: monday });
    const res = await coachA.post(`/plans/${empty.body.id}/publish`);
    expect(res.status).toBe(400);
    await coachA.delete(`/plans/${empty.body.id}`);
  });

  it("diffuse le cycle : DRAFT → PUBLISHED, une seule fois", async () => {
    const res = await coachA.post(`/plans/${planId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PUBLISHED");
    expect(res.body.publishedAt).not.toBeNull();

    expect((await coachA.post(`/plans/${planId}/publish`)).status).toBe(409);
  });

  it("l'athlète consulte SON cycle diffusé (semaines + séances) et le détail d'une séance", async () => {
    const plan = await athleteA1.get("/me/plan");
    expect(plan.status).toBe(200);
    expect(plan.body.id).toBe(planId);
    expect(plan.body.weeks).toHaveLength(2);
    expect(plan.body.weeks[0].sessions).toHaveLength(1);
    expect(plan.body.weeks[0].sessions[0]).toMatchObject({
      id: scheduledId,
      scheduledDate: monday,
      status: "PLANNED",
      exerciseCount: 1,
    });

    const session = await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`);
    expect(session.status).toBe(200);
    expect(session.body.exercises[0].title).toBe("Tractions lestées");
    expect(session.body.exercises[0].documents).toHaveLength(1);
  });

  it("l'athlète d'un autre coach ne voit rien de ce cycle", async () => {
    expect((await athleteB1.get("/me/plan")).body).toBeNull();
    expect((await athleteB1.get(`/me/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  it("les routes de construction restent interdites à l'athlète", async () => {
    expect((await athleteA1.get("/plans")).status).toBe(403);
    expect((await athleteA1.get(`/scheduled-sessions/${scheduledId}`)).status).toBe(403);
    expect((await athleteA1.post(`/plans/${planId}/weeks`).send({ type: "TRAINING" })).status).toBe(
      403,
    );
    // Symétrie : les routes /me/* sont réservées à l'athlète.
    expect((await coachA.get("/me/plan")).status).toBe(403);
  });

  // C'est l'arbitrage du modèle : l'instance est une copie autonome (sourceExerciseId en SetNull),
  // donc la bibliothèque reste librement modifiable — pas de 409 à vie sur un exercice planifié.
  it("supprimer un exercice de la bibliothèque ne casse PAS la planification diffusée", async () => {
    // Il faut d'abord le retirer du MODÈLE (SessionExercise reste en Restrict → 409).
    expect((await coachA.delete(`/exercises/${exerciseAId}`)).status).toBe(409);
    await coachA
      .put(`/sessions/${templateId}`)
      .send({ title: "Bloc force max", notes: null, exercises: [] });

    expect((await coachA.delete(`/exercises/${exerciseAId}`)).status).toBe(204);

    // La séance de l'athlète est intacte : titre, prescription et document toujours là.
    const session = await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`);
    expect(session.status).toBe(200);
    expect(session.body.exercises[0].title).toBe("Tractions lestées");
    expect(session.body.exercises[0].sourceExerciseId).toBeNull(); // FK passée à null
    expect(session.body.exercises[0].documents).toHaveLength(1);
  });
});

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

  async function link(coach: Agent, athlete: Agent): Promise<string> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    expect(accepted.status).toBe(201);
    return accepted.body.athleteId;
  }

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
    await coachA.post(`/plans/${planId}/publish`);
    sessionId = draftSessionId;

    const res = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("débriefe la séance : le texte est enregistré et la séance passe en DONE", async () => {
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

describe("Médias de débrief (P4)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let athleteB1: Agent;
  let sessionId: string;
  let a1Id: string;

  const monday = mondayOfCurrentWeek();

  const photo = (fileName = "voie.jpg") => ({
    type: "IMAGE",
    fileName,
    mimeType: "image/jpeg",
    size: 120_000,
  });
  const video = (fileName = "essai.mp4") => ({
    type: "VIDEO",
    fileName,
    mimeType: "video/mp4",
    size: 8_000_000,
    durationSeconds: 42,
  });

  async function link(coach: Agent, athlete: Agent): Promise<string> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    return accepted.body.athleteId;
  }

  // Parcours réel : URL signée → PUT direct vers le storage → rattachement.
  async function upload(agent: Agent, input: Record<string, unknown>): Promise<string> {
    const signed = await agent
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(input);
    expect(signed.status).toBe(201);

    // `content-length` n'est PAS posé à la main : undici le refuse et le calcule lui-même depuis
    // le corps. C'est justement ce qu'on veut vérifier — l'URL étant signée avec la taille
    // annoncée à l'API, l'upload ne passe que si le poids réel correspond.
    const body = Buffer.alloc(input.size as number, 1);
    const put = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body,
      headers: { "content-type": input.mimeType as string },
    });
    expect(put.status).toBe(200);

    return signed.body.storagePath;
  }

  beforeAll(async () => {
    coachA = await signUp("media-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("media-athlete-a1@cmv.test", Role.ATHLETE);
    const coachB = await signUp("media-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("media-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    await link(coachB, athleteB1);

    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle médias",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coachA
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: "Séance filmée", scheduledDate: monday });
    sessionId = session.body.id;
    await coachA.post(`/plans/${plan.body.id}/publish`);
  });

  it("rattache une photo à une séance jamais débriefée : le débrief est créé, la séance passe DONE", async () => {
    const storagePath = await upload(athleteA1, photo());
    const attached = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
      .send({ ...photo(), storagePath });
    expect(attached.status).toBe(201);
    expect(attached.body).toMatchObject({
      type: "IMAGE",
      fileName: "voie.jpg",
      sizeBytes: 120_000,
    });
    // Média = fichier privé : l'URL de lecture est toujours signée, jamais publique.
    expect(attached.body.url).toContain("X-Amz-Signature");
    expect(attached.body.durationSeconds).toBeNull();

    const feedback = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    expect(feedback.body.content).toBeNull(); // débrief média-seul
    expect(feedback.body.media).toHaveLength(1);

    const session = await athleteA1.get(`/me/scheduled-sessions/${sessionId}`);
    expect(session.body.status).toBe("DONE");
  });

  it("demander une URL d'upload ne débriefe pas à soi seul (une capture abandonnée n'engage rien)", async () => {
    const other = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle témoin",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coachA
      .post(`/plan-weeks/${other.body.weeks[0].id}/sessions`)
      .send({ title: "Séance témoin", scheduledDate: monday });
    await coachA.post(`/plans/${other.body.id}/publish`);

    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${session.body.id}/feedback/media/upload-url`)
      .send(photo());
    expect(signed.status).toBe(201);

    expect(
      (await athleteA1.get(`/me/scheduled-sessions/${session.body.id}/feedback`)).body,
    ).toBeNull();
    expect((await athleteA1.get(`/me/scheduled-sessions/${session.body.id}`)).body.status).toBe(
      "PLANNED",
    );
  });

  // Sans la taille dans la signature, un client pourrait déclarer 8 Mo puis pousser ce qu'il
  // veut : le plafond du schéma ne serait qu'une politesse.
  it("le storage refuse un envoi plus lourd que la taille signée", async () => {
    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(photo("menteuse.jpg"));
    expect(signed.status).toBe(201);

    const tooBig = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(120_000 * 2, 1),
      headers: { "content-type": "image/jpeg" },
    });
    expect(tooBig.ok).toBe(false);
  });

  it("plafonne à 3 vidéos par débrief (409 sur la 4e)", async () => {
    for (let i = 0; i < 3; i++) {
      const storagePath = await upload(athleteA1, video(`essai-${i}.mp4`));
      const res = await athleteA1
        .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
        .send({ ...video(`essai-${i}.mp4`), storagePath });
      expect(res.status).toBe(201);
    }

    // Le quota est refusé DÈS la demande d'URL : pas d'upload de 50 Mo pour s'entendre dire non.
    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(video("de-trop.mp4"));
    expect(signed.status).toBe(409);
  });

  it("les photos ont leur propre quota (5), indépendant des vidéos", async () => {
    for (let i = 1; i < 5; i++) {
      const storagePath = await upload(athleteA1, photo(`voie-${i}.jpg`));
      const res = await athleteA1
        .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
        .send({ ...photo(`voie-${i}.jpg`), storagePath });
      expect(res.status).toBe(201);
    }

    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(photo("de-trop.jpg"));
    expect(signed.status).toBe(409);
  });

  it("supprimer un média libère une place dans le quota", async () => {
    const feedback = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    const firstPhoto = feedback.body.media.find((m: { type: string }) => m.type === "IMAGE");

    const removed = await athleteA1.delete(
      `/me/scheduled-sessions/${sessionId}/feedback/media/${firstPhoto.id}`,
    );
    expect(removed.status).toBe(204);

    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(photo("remplacement.jpg"));
    expect(signed.status).toBe(201);
  });

  // Les plafonds vivent dans le schéma partagé → rejet AVANT le service, sans code dédié.
  it("mime, taille et durée sont validés par le schéma partagé (400)", async () => {
    const url = `/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`;

    expect((await athleteA1.post(url).send({ ...video(), mimeType: "video/avi" })).status).toBe(
      400,
    );
    expect((await athleteA1.post(url).send({ ...video(), size: 51 * 1024 * 1024 })).status).toBe(
      400,
    );
    expect((await athleteA1.post(url).send({ ...video(), durationSeconds: 61 })).status).toBe(400);
    // Une vidéo sans durée déclarée : la branche VIDEO l'exige.
    expect(
      (await athleteA1.post(url).send({ ...video(), durationSeconds: undefined })).status,
    ).toBe(400);
  });

  it("un athlète ne dépose ni ne supprime de média sur la séance d'un autre", async () => {
    const url = `/me/scheduled-sessions/${sessionId}/feedback/media`;
    expect((await athleteB1.post(`${url}/upload-url`).send(photo())).status).toBe(404);
    expect(
      (await athleteB1.post(url).send({ ...photo(), storagePath: "athlete/x/voie.jpg" })).status,
    ).toBe(404);

    const feedback = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    const mediaId = feedback.body.media[0].id;
    expect((await athleteB1.delete(`${url}/${mediaId}`)).status).toBe(404);
  });

  it("le dépôt de médias reste interdit au coach", async () => {
    const url = `/me/scheduled-sessions/${sessionId}/feedback/media`;
    expect((await coachA.post(`${url}/upload-url`).send(photo())).status).toBe(403);
  });
});

describe("Tokens de notification push (P4)", () => {
  let coach: Agent;
  let athlete: Agent;
  let other: Agent;

  const TOKEN = "ExponentPushToken[athlete-device-1]";

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

    const asCoach = await coach
      .post("/me/push-tokens")
      .send({ token: "ExponentPushToken[coach-device]", platform: "ANDROID" });
    expect(asCoach.status).toBe(201);
  });

  // L'app réenregistre son token à chaque démarrage : ce n'est pas un doublon.
  it("réenregistrer le même appareil met la ligne à jour", async () => {
    const again = await athlete.post("/me/push-tokens").send({ token: TOKEN, platform: "ANDROID" });
    expect(again.status).toBe(201);
    expect(again.body.platform).toBe("ANDROID");
  });

  // Le token est unique en base : sans réaffectation, se reconnecter avec un autre compte sur
  // le même téléphone violerait la contrainte (500).
  it("un appareil qui change de main est réaffecté au dernier compte connecté", async () => {
    const stolen = await other.post("/me/push-tokens").send({ token: TOKEN, platform: "IOS" });
    expect(stolen.status).toBe(201);

    // L'ancien propriétaire ne le révoque plus : la ligne ne lui appartient plus.
    const revokeByPrevious = await athlete.delete(`/me/push-tokens/${TOKEN}`);
    expect(revokeByPrevious.status).toBe(204);
    expect(
      (await other.post("/me/push-tokens").send({ token: TOKEN, platform: "IOS" })).status,
    ).toBe(201);
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
    const invitation = await c.post("/invitations").send({});
    const accepted = await a.post("/invitations/accept").send({ code: invitation.body.code });

    const monday = mondayOfCurrentWeek();
    const plan = await c.post("/plans").send({
      athleteId: accepted.body.athleteId,
      title: "Cycle push",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await c
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: "Séance", scheduledDate: monday });
    expect((await c.post(`/plans/${plan.body.id}/publish`)).status).toBe(200);

    const feedback = await a
      .put(`/me/scheduled-sessions/${session.body.id}/feedback`)
      .send({ content: "RAS" });
    expect(feedback.status).toBe(200);

    // Ajustement en cours de cycle diffusé (CDC §5.7) : notifie l'athlète, sans échouer.
    const adjusted = await c.put(`/scheduled-sessions/${session.body.id}`).send({
      title: "Séance (ajustée)",
      notes: null,
      scheduledDate: monday,
      exercises: [],
    });
    expect(adjusted.status).toBe(200);
  });
});
