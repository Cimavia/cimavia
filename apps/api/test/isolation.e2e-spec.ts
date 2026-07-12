import { Role } from "@cmv/shared";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/infra/prisma/prisma.service";

const TABLES = [
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

  it("un coach ne voit que SES athlètes", async () => {
    const res = await coachA.get("/athletes");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].athleteId).toBe(a1Id);
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

  it("URL d'upload : 503 si storage non configuré (entrée valide)", async () => {
    // .env.test ne fournit pas de config S3 → 503 (l'API démarre quand même).
    const noStorage = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "demo.pdf", mimeType: "application/pdf", size: 1000 });
    expect(noStorage.status).toBe(503);
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
});
