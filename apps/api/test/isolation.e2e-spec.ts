import {
  MAX_FEEDBACK_AUDIOS,
  MAX_FEEDBACK_PHOTOS,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MAX_FEEDBACK_VIDEO_SIZE_BYTES,
  MAX_FEEDBACK_VIDEOS,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  mondayOfIsoWeek,
  multipartPartCount,
  multipartPartSizes,
  Role,
  shiftIsoDate,
} from "@cmv/shared";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/infra/prisma/prisma.service";

const TABLES = [
  "notification",
  "reminder",
  "invoice",
  "message",
  "conversation",
  "feedback_media",
  "session_feedback",
  "push_token",
  "scheduled_session_exercise_document",
  "scheduled_session_exercise_tag",
  "scheduled_session_exercise",
  "scheduled_session",
  "plan_week",
  "plan",
  "session_exercise",
  "exercise_document",
  "exercise_tag",
  "sessions",
  "exercise",
  "custom_metric",
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

/**
 * Sous `noUncheckedIndexedAccess`, `list[0]` et `.find()` rendent `T | undefined`. La correction
 * réflexe — `list[0]?.id` — est un piège : une liste vide produirait alors une requête sur
 * `/undefined` dont le 404 ferait PASSER un test d'isolation qui ne teste plus rien. On échoue
 * donc ici, à l'endroit exact où la donnée manque, avec le nom de ce qu'on attendait.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Donnée de test absente : ${what}`);
  return value;
}

let app: NestFastifyApplication;
let baseURL: string;

/**
 * Inscrit un compte en envoyant ses CAPACITÉS — ce que le signup transmet depuis #12, `role` en
 * étant déduit côté API. La signature reste par rôle pour les quelque cent appels de ce fichier :
 * « un coach », « un athlète » dit mieux l'intention du test que deux booléens.
 */
async function signUp(email: string, role: string): Promise<Agent> {
  return signUpWith(email, { isCoach: role === Role.COACH, isAthlete: role === Role.ATHLETE });
}

/** Inscription à capacités explicites — le seul moyen d'obtenir un compte qui CUMULE. */
async function signUpWith(
  email: string,
  capabilities: { isCoach: boolean; isAthlete: boolean },
): Promise<Agent> {
  const agent = request.agent(baseURL);
  const res = await agent
    .post("/api/auth/sign-up/email")
    .send({ name: email, email, password: PASSWORD, ...capabilities });
  expect([200, 201]).toContain(res.status);
  return agent;
}

// Diffuser un cycle exige désormais une facturation saisie (gating P6). Les setups qui veulent
// juste un cycle diffusé passent par ce raccourci : termes de facturation puis publish.
async function billAndPublish(coach: Agent, planId: string) {
  await coach.put(`/plans/${planId}/billing`).send({ amountCents: 5000, dueDate: "2026-01-05" });
  return coach.post(`/plans/${planId}/publish`);
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
      tags: ["Gainage", "renfo"],
    });
    expect(created.status).toBe(201);
    exerciseAId = created.body.id;
    expect(typeof created.body.coachId).toBe("string");
    expect(created.body.documents).toEqual([]);
    expect(created.body.tags).toEqual(["gainage", "renfo"]);

    const decoy = await coachB.post("/exercises").send({
      title: "Traction",
      tags: ["poulie"],
    });
    expect(decoy.status).toBe(201);
  });

  it("un coach ne voit que SES tags", async () => {
    const own = await coachA.get("/exercises/tags");
    expect(own.status).toBe(200);
    expect(own.body).toEqual(["gainage", "renfo"]);

    const other = await coachB.get("/exercises/tags");
    expect(other.body).toEqual(["poulie"]);
  });

  it("le filtre par tag ne franchit pas la frontière du coach", async () => {
    const own = await coachA.get("/exercises").query({ tag: "Gainage" });
    expect(own.body).toHaveLength(1);
    expect(own.body[0].id).toBe(exerciseAId);

    // Le tag existe, mais chez l'autre coach : la liste doit rester vide, pas fuir l'exercice.
    const other = await coachB.get("/exercises").query({ tag: "gainage" });
    expect(other.body).toHaveLength(0);
  });

  it("un coach ne liste que SES exercices", async () => {
    const own = await coachA.get("/exercises");
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0].id).toBe(exerciseAId);

    // coachB a le sien : la liste n'est pas vide, elle est simplement disjointe.
    const other = await coachB.get("/exercises");
    expect(other.body.map((e: { id: string }) => e.id)).not.toContain(exerciseAId);
  });

  it("compte les séances MODÈLES qui référencent l'exercice, pas les copies diffusées", async () => {
    const fresh = await coachA.post("/exercises").send({ title: "Gainage latéral" });
    expect(fresh.body.usedInSessionCount).toBe(0);

    const session = await coachA.post("/sessions").send({
      title: "Circuit court",
      exercises: [{ exerciseId: fresh.body.id, note: "3×30 s" }],
    });
    expect(session.status).toBe(201);

    const used = await coachA.get(`/exercises/${fresh.body.id}`);
    expect(used.body.usedInSessionCount).toBe(1);

    // Retirer l'exercice de la séance le fait redescendre : le compte est lu, jamais stocké.
    await coachA.put(`/sessions/${session.body.id}`).send({
      title: "Circuit court",
      exercises: [],
    });
    expect((await coachA.get(`/exercises/${fresh.body.id}`)).body.usedInSessionCount).toBe(0);

    await coachA.delete(`/sessions/${session.body.id}`);
    await coachA.delete(`/exercises/${fresh.body.id}`);
  });

  it("un coach ne peut PAS lire l'exercice d'un autre coach", async () => {
    const res = await coachB.get(`/exercises/${exerciseAId}`);
    expect(res.status).toBe(404);
  });

  it("consigne structurée et blocs font l'aller-retour sans perte", async () => {
    const instructions = [
      { type: "HEADING", content: [{ text: "Mise en place" }] },
      { type: "PARAGRAPH", content: [{ text: "Coudes ", marks: ["BOLD"] }, { text: "serrés." }] },
    ];
    const blocks = [
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
        rows: [{ id: "r1", values: { col_reps: 6 } }],
      },
    ];

    const created = await coachA
      .post("/exercises")
      .send({ title: "Tractions lestées", instructions, blocks });
    expect(created.status).toBe(201);

    // Relecture : le JSON ne doit ni se réordonner ni perdre ses marques d'inline.
    const read = await coachA.get(`/exercises/${created.body.id}`);
    expect(read.body.instructions).toEqual(instructions);
    expect(read.body.blocks).toEqual(blocks);
  });

  it("refuse un bloc dont la structure ne tient pas", async () => {
    // EMOM dont la durée totale ne couvre pas un intervalle : refusé par exerciseBlockSchema,
    // donc 400 — jamais écrit en base, où plus rien ne le rattraperait.
    const res = await coachA.post("/exercises").send({
      title: "EMOM impossible",
      blocks: [
        {
          id: "blk_1",
          label: null,
          structure: { type: "EMOM", intervalSeconds: 60, totalDurationSeconds: 30 },
          metrics: [
            {
              id: "c1",
              source: "CATALOG",
              key: "REPETITIONS",
              unit: "REPS",
              label: null,
              collapsed: false,
            },
          ],
          rows: [],
        },
      ],
    });
    expect(res.status).toBe(400);
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
    expect((await athlete.post("/exercises").send({ title: "x" })).status).toBe(403);
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

  it("distingue l'image de consigne de la pièce jointe", async () => {
    const link = await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://exemple.test/fiche" });
    // Un LINK est toujours une pièce jointe : le lien inline de la consigne est une MARQUE sur du
    // texte, pas un document rattaché.
    expect(link.body.usage).toBe("ATTACHMENT");

    const upload = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "position-basse.jpg", mimeType: "image/jpeg", size: 2048 });
    const image = await coachA.post(`/exercises/${exerciseAId}/documents`).send({
      type: "FILE",
      storagePath: upload.body.storagePath,
      fileName: "position-basse.jpg",
      mimeType: "image/jpeg",
      usage: "INSTRUCTION",
    });
    expect(image.status).toBe(201);
    expect(image.body.usage).toBe("INSTRUCTION");

    await coachA.delete(`/exercises/${exerciseAId}/documents/${link.body.id}`);
    await coachA.delete(`/exercises/${exerciseAId}/documents/${image.body.id}`);
  });

  it("refuse un PDF comme image de consigne", async () => {
    // Le PDF reste une pièce jointe légitime, mais il n'a aucun rendu inline dans un document —
    // ni sur le web ni en React Native.
    const upload = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "fiche.pdf", mimeType: "application/pdf", size: 2048 });
    const res = await coachA.post(`/exercises/${exerciseAId}/documents`).send({
      type: "FILE",
      storagePath: upload.body.storagePath,
      fileName: "fiche.pdf",
      mimeType: "application/pdf",
      usage: "INSTRUCTION",
    });
    expect(res.status).toBe(400);
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

  it("le pipe de validation global est actif (titre vide, champ inconnu → 400)", async () => {
    expect((await coachA.post("/exercises").send({ title: "" })).status).toBe(400);
    // `category` a disparu du contrat en #163 : le schéma est strict, l'envoyer encore est un 400.
    expect((await coachA.post("/exercises").send({ title: "x", category: "RENFO" })).status).toBe(
      400,
    );
  });
});

describe("Métriques maison du coach (#162)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let metricAId: string;

  beforeAll(async () => {
    coachA = await signUp("metric-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("metric-coach-b@cmv.test", Role.COACH);

    const created = await coachA.post("/custom-metrics").send({
      label: "Cotation maison",
      unit: null,
      valueType: "SCALE",
      scale: ["facile", "moyen", "dur"],
    });
    expect(created.status).toBe(201);
    metricAId = created.body.id;
    expect(created.body.scale).toEqual(["facile", "moyen", "dur"]);
  });

  it("un coach ne liste que SES métriques", async () => {
    const own = await coachA.get("/custom-metrics");
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0].label).toBe("Cotation maison");

    expect((await coachB.get("/custom-metrics")).body).toHaveLength(0);
  });

  it("un coach ne peut ni modifier ni supprimer la métrique d'un autre", async () => {
    const patch = await coachB.patch(`/custom-metrics/${metricAId}`).send({
      label: "Intrusion",
      unit: null,
      valueType: "NUMBER",
      scale: null,
    });
    expect(patch.status).toBe(404);
    expect((await coachB.delete(`/custom-metrics/${metricAId}`)).status).toBe(404);
  });

  it("refuse deux métriques de même nom chez le MÊME coach, pas entre coachs", async () => {
    const duplicate = await coachA
      .post("/custom-metrics")
      .send({ label: "Cotation maison", unit: null, valueType: "NUMBER", scale: null });
    expect(duplicate.status).toBe(409);

    // Le même libellé chez un AUTRE coach est légitime : l'unicité est par tenant.
    const elsewhere = await coachB
      .post("/custom-metrics")
      .send({ label: "Cotation maison", unit: null, valueType: "NUMBER", scale: null });
    expect(elsewhere.status).toBe(201);
    await coachB.delete(`/custom-metrics/${elsewhere.body.id}`);
  });

  it("tient l'invariant type/paliers dans les deux sens", async () => {
    // SCALE sans paliers : aucune saisie ne serait possible.
    const noSteps = await coachA
      .post("/custom-metrics")
      .send({ label: "Sans paliers", unit: null, valueType: "SCALE", scale: null });
    expect(noSteps.status).toBe(400);

    // Paliers sur un type qui n'en veut pas : donnée morte, et un rendu qui ne saurait qu'en faire.
    const strayScale = await coachA
      .post("/custom-metrics")
      .send({ label: "Nombre paliers", unit: "pts", valueType: "NUMBER", scale: ["a", "b"] });
    expect(strayScale.status).toBe(400);
  });

  it("la mise à jour REMPLACE la définition", async () => {
    const res = await coachA
      .patch(`/custom-metrics/${metricAId}`)
      .send({ label: "Indice technique", unit: "pts", valueType: "NUMBER", scale: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: metricAId,
      label: "Indice technique",
      unit: "pts",
      valueType: "NUMBER",
      scale: null,
    });
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

// Le cycle démarre TOUJOURS un lundi (planStartDateSchema) : on prend celui de la semaine en
// cours, pour que le plan diffusé soit bien le plan « courant » vu par l'athlète.
function mondayOfCurrentWeek(): string {
  const monday = mondayOfIsoWeek(new Date().toISOString().slice(0, 10));
  if (monday == null) throw new Error("[test] lundi de la semaine courante introuvable");
  return monday;
}

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
    expect((await coach.patch(`/exercises/${exerciseId}`).send({ blocks: updated })).status).toBe(
      200,
    );

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
  // La semaine 2 commence sept jours après le lundi de départ : une séance doit tomber dans la
  // plage de SA semaine, l'API le vérifie.
  const mondayOfWeek2 = new Date(`${monday}T00:00:00Z`);
  mondayOfWeek2.setUTCDate(mondayOfWeek2.getUTCDate() + 7);
  const mondayOfWeek2Iso = mondayOfWeek2.toISOString().slice(0, 10);

  const LIBRARY_INSTRUCTIONS = [{ type: "PARAGRAPH", content: [{ text: "Coudes serrés." }] }];
  const LIBRARY_BLOCKS = [
    {
      id: "blk_1",
      label: "Travail",
      structure: { type: "SERIES", setCount: 5, restBetweenSetsSeconds: 180 },
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
      rows: [{ id: "r1", values: { col_reps: 5 } }],
    },
  ];

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
    const exercise = await coachA.post("/exercises").send({
      title: "Tractions lestées",
      description: "Prise large",
      instructions: LIBRARY_INSTRUCTIONS,
      blocks: LIBRARY_BLOCKS,
    });
    exerciseAId = exercise.body.id;
    await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://youtu.be/demo" });

    const template = await coachA.post("/sessions").send({
      title: "Bloc force max",
      notes: "Repos 3 min.",
      exercises: [{ exerciseId: exerciseAId, note: "5×5" }],
    });
    templateId = template.body.id;

    const exerciseB = await coachB.post("/exercises").send({ title: "Chez B", tags: ["grimpe"] });
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
      note: "5×5",
      position: 0,
    });
    // Le document de l'exercice suit la copie : sans lui, l'athlète n'y aurait aucun accès.
    expect(res.body.exercises[0].documents).toHaveLength(1);
    expect(res.body.exercises[0].documents[0].url).toBe("https://youtu.be/demo");
    // Consigne et structure suivent aussi : sans elles l'athlète garderait le titre et perdrait
    // ce qu'il doit faire.
    expect(res.body.exercises[0].instructions).toEqual(LIBRARY_INSTRUCTIONS);
    expect(res.body.exercises[0].blocks).toEqual(LIBRARY_BLOCKS);
  });

  it("la copie est FIGÉE : retravailler l'exercice source ne la touche pas", async () => {
    const patched = await coachA.patch(`/exercises/${exerciseAId}`).send({
      instructions: [{ type: "PARAGRAPH", content: [{ text: "Réécrit après diffusion." }] }],
      blocks: [],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.blocks).toEqual([]);

    const read = await coachA.get(`/scheduled-sessions/${scheduledId}`);
    expect(read.body.exercises[0].instructions).toEqual(LIBRARY_INSTRUCTIONS);
    expect(read.body.exercises[0].blocks).toEqual(LIBRARY_BLOCKS);
  });

  it("diffuse le dosage de la SÉANCE, pas celui de la bibliothèque", async () => {
    // La régression que ce test verrouille : lire les blocs de l'exercice au moment de la
    // diffusion ferait disparaître, sans le moindre avertissement, tout ce que le coach a ajusté
    // au niveau séance.
    const template = await coachA.get(`/sessions/${templateId}`);
    const composed = template.body.exercises[0];
    const tuned = composed.blocks.map((block: { rows: { id: string; values: unknown }[] }) => ({
      ...block,
      rows: block.rows.map((row) => (row.id === "r1" ? { ...row, values: { col_reps: 3 } } : row)),
    }));

    // La note est renvoyée telle quelle : ce test ajuste le DOSAGE, et les suivants comptent sur
    // le modèle intact — une suite e2e partage ses fixtures.
    const saved = await coachA.put(`/sessions/${templateId}`).send({
      title: "Bloc force max",
      notes: "Repos 3 min.",
      exercises: [
        {
          id: composed.id,
          exerciseId: exerciseAId,
          note: composed.note,
          blocks: tuned,
          adjustments: [{ path: "blk_1/rows/r1/col_reps", level: "SESSION" }],
        },
      ],
    });
    expect(saved.status).toBe(200);

    // Diffusée en semaine 2, dont aucun test ne compte les séances, puis retirée aussitôt : la
    // semaine 1 est le décor d'autres assertions.
    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    const copy = diffused.body.exercises[0];
    expect(copy.blocks[0].rows[0].values.col_reps).toBe(3);
    // Le marqueur du niveau séance voyage avec la copie : l'athlète doit voir CE qui a été ajusté
    // pour lui, et le coach distinguer les deux niveaux sur la même grille.
    expect(copy.adjustments).toEqual([{ path: "blk_1/rows/r1/col_reps", level: "SESSION" }]);
    expect(copy.baseline).toEqual(copy.blocks);

    // Nettoyage par courtoisie : aucune assertion sur son statut, la semaine 2 n'est comptée
    // nulle part et un échec ici ne dirait rien d'utile.
    await coachA.delete(`/scheduled-sessions/${diffused.body.id}`);
  });

  it("une métrique MAISON citée par un bloc part avec la diffusion", async () => {
    // La régression que ce test verrouille : `customMetricSchema` est `.strict()`, et la ligne
    // Prisma porte `coachId`, `createdAt`, `updatedAt`. La parser telle quelle faisait échouer
    // TOUTE la diffusion en 500 dès qu'un exercice citait une métrique maison — et rien ne le
    // couvrait, la copie du snapshot n'ayant été testée qu'avec des métriques du catalogue.
    const metric = await coachA.post("/custom-metrics").send({
      label: "Cotation française",
      unit: null,
      valueType: "SCALE",
      scale: ["6a", "6b", "6c"],
    });
    expect(metric.status).toBe(201);

    const blocks = [
      {
        id: "blk_home",
        label: null,
        structure: { type: "SERIES", setCount: 2, restBetweenSetsSeconds: 60 },
        metrics: [
          {
            id: "col_grade",
            source: "CUSTOM",
            customMetricId: metric.body.id,
            label: null,
            collapsed: false,
          },
        ],
        rows: [{ id: "r1", values: { col_grade: "6b" } }],
      },
    ];
    const exercise = await coachA
      .post("/exercises")
      .send({ title: "Voie en 6b", tags: ["grimpe"], blocks });
    expect(exercise.status).toBe(201);

    const template = await coachA.post("/sessions").send({
      title: "Séance métrique maison",
      exercises: [{ exerciseId: exercise.body.id }],
    });
    expect(template.status).toBe(201);

    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    // La DÉFINITION voyage, pas seulement l'identifiant : `/custom-metrics` est scopé au coach,
    // et l'athlète n'y aura jamais accès.
    expect(diffused.body.exercises[0].customMetrics).toEqual([
      {
        id: metric.body.id,
        label: "Cotation française",
        unit: null,
        valueType: "SCALE",
        scale: ["6a", "6b", "6c"],
      },
    ]);

    await coachA.delete(`/scheduled-sessions/${diffused.body.id}`);
  });

  it("les images de consigne survivent à la diffusion", async () => {
    // Les documents sont recopiés en NOUVELLES lignes : sans remappage, la consigne de l'athlète
    // référencerait des identifiants de la bibliothèque, qui ne désignent rien chez lui — et
    // l'échec serait silencieux, un média introuvable ne s'affichant simplement pas.
    const upload = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "position.jpg", mimeType: "image/jpeg", size: 2048 });
    const image = await coachA.post(`/exercises/${exerciseAId}/documents`).send({
      type: "FILE",
      storagePath: upload.body.storagePath,
      fileName: "position.jpg",
      mimeType: "image/jpeg",
      usage: "INSTRUCTION",
    });
    expect(image.status).toBe(201);

    const withImage = await coachA.patch(`/exercises/${exerciseAId}`).send({
      instructions: [
        { type: "PARAGRAPH", content: [{ text: "Position basse." }] },
        { type: "IMAGE", mediaId: image.body.id },
      ],
    });
    expect(withImage.status).toBe(200);

    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    const copy = diffused.body.exercises[0];
    const block = copy.instructions.find((item: { type: string }) => item.type === "IMAGE");
    const documentIds = copy.documents.map((document: { id: string }) => document.id);

    // L'identifiant a changé ET il désigne un document de la COPIE.
    expect(block.mediaId).not.toBe(image.body.id);
    expect(documentIds).toContain(block.mediaId);

    await coachA.delete(`/scheduled-sessions/${diffused.body.id}`);
    await coachA.delete(`/exercises/${exerciseAId}/documents/${image.body.id}`);
  });

  it("refuse une séance hors de la plage de sa semaine, ou référençant l'exercice d'un autre coach", async () => {
    const outOfWeek = await coachA
      .post(`/plan-weeks/${week1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: "2027-01-04" });
    expect(outOfWeek.status).toBe(400);

    const foreignExercise = await coachA.post(`/plan-weeks/${week1Id}/sessions`).send({
      title: "Intrusion",
      scheduledDate: monday,
      exercises: [{ sourceExerciseId: exerciseBId, title: "Volé" }],
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
          note: "4×6 — épaule sensible",
        },
      ],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.exercises[0].note).toBe("4×6 — épaule sensible");

    const template = await coachA.get(`/sessions/${templateId}`);
    expect(template.body.title).toBe("Bloc force max");
    expect(template.body.exercises[0].note).toBe("5×5");
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
    // Gating P6 : sans facturation saisie, la diffusion est refusée (rien n'est diffusé).
    expect((await coachA.post(`/plans/${planId}/publish`)).status).toBe(400);

    const billing = await coachA
      .put(`/plans/${planId}/billing`)
      .send({ amountCents: 6000, dueDate: monday });
    expect(billing.status).toBe(200);
    expect(billing.body.status).toBe("DRAFT");

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

    // La séance de l'athlète est intacte : titre, note et document toujours là.
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
    await billAndPublish(coachA, planId);
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

    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    const athleteId = accepted.body.athleteId;

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

  it("un athlète ne suit PAS la séance d'un autre", async () => {
    const res = await other.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { [exerciseCopyId]: { blk_1: { checked: [0] } } },
    });
    expect(res.status).toBe(404);
  });

  it("un identifiant d'exercice étranger n'écrit RIEN", async () => {
    // L'écriture est pilotée par l'entrée : sans `where` scopé sur la séance, un id forgé
    // atteindrait la ligne d'un autre.
    const before = (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0];
    const res = await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({
      tracking: { cmv_inconnu: { blk_1: { checked: [0, 1, 2, 3] } } },
    });
    expect(res.status).toBe(200);
    const after = (await athlete.get(`/me/scheduled-sessions/${sessionId}`)).body.exercises[0];
    expect(after.tracking).toEqual(before.tracking);
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
  const audio = (fileName = "note.m4a") => ({
    type: "AUDIO",
    fileName,
    mimeType: "audio/m4a",
    size: 200_000,
    durationSeconds: 18,
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
    await billAndPublish(coachA, plan.body.id);
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

  // Débrief vocal (P5, CDC §4) : même flux que photo/vidéo, MediaType étendu à AUDIO.
  it("rattache une note vocale au débrief (durée conservée)", async () => {
    const storagePath = await upload(athleteA1, audio());
    const attached = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
      .send({ ...audio(), storagePath });
    expect(attached.status).toBe(201);
    expect(attached.body).toMatchObject({
      type: "AUDIO",
      fileName: "note.m4a",
      durationSeconds: 18,
    });
    expect(attached.body.url).toContain("X-Amz-Signature");
  });

  /**
   * Le plafond vient de la CONSTANTE, jamais d'un chiffre écrit ici : `MAX_FEEDBACK_AUDIOS` est
   * passé de 3 à 15 en cours de route, et ce test s'est mis à échouer sans que rien ne le signale
   * — les e2e ne tournent pas dans la CI (`turbo test` n'appelle pas `test:e2e`).
   */
  it("plafonne les notes vocales par débrief (409)", async () => {
    // Une note est déjà posée par le test précédent.
    for (let index = 0; index < MAX_FEEDBACK_AUDIOS - 1; index += 1) {
      const storagePath = await upload(athleteA1, audio(`note-${index}.m4a`));
      const res = await athleteA1
        .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
        .send({ ...audio(`note-${index}.m4a`), storagePath });
      expect(res.status).toBe(201);
    }
    // La suivante dépasse le plafond.
    const overflow = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(audio("trop.m4a"));
    expect(overflow.status).toBe(409);
  });

  it("refuse un mime audio non supporté (400)", async () => {
    const res = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send({ ...audio(), mimeType: "audio/webm" });
    expect(res.status).toBe(400);
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
    await billAndPublish(coachA, other.body.id);

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

  it("plafonne les vidéos d'un débrief (409 sur celle de trop)", async () => {
    // Le plafond vient de la CONSTANTE, jamais d'un chiffre écrit ici : relevé en #156, il aurait
    // rendu ce test rouge sans qu'aucune règle n'ait changé.
    for (let i = 0; i < MAX_FEEDBACK_VIDEOS; i++) {
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

  it("les photos ont leur propre quota, indépendant des vidéos", async () => {
    // Démarre à 1 : une photo est déjà attachée par un test précédent de ce même débrief.
    for (let i = 1; i < MAX_FEEDBACK_PHOTOS; i++) {
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
    // Bornes dérivées des constantes : écrites en dur, elles cesseraient de tester le plafond
    // réel au premier ajustement — c'est exactement ce qui est arrivé (50 Mo → 1 Go).
    expect(
      (await athleteA1.post(url).send({ ...video(), size: MAX_FEEDBACK_VIDEO_SIZE_BYTES + 1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await athleteA1
          .post(url)
          .send({ ...video(), durationSeconds: MAX_FEEDBACK_VIDEO_DURATION_SECONDS + 1 })
      ).status,
    ).toBe(400);
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

  /**
   * Envoi découpé — ce qui se passe au-delà du seuil, le PUT unique ne franchissant pas le bord
   * réseau (100 Mo mesurés). Séance DÉDIÉE : les tests de quota ci-dessus ont déjà attaché 3
   * vidéos à `sessionId`, et toute demande d'URL y répondrait 409 avant d'atteindre ce qu'on veut
   * tester.
   */
  describe("upload découpé", () => {
    let bigSessionId: string;
    let mediaUrl: string;

    // La plus petite vidéo qui force le découpage : un octet de plus que le seuil.
    const bigVideo = (fileName = "longue.mp4") => ({
      type: "VIDEO",
      fileName,
      mimeType: "video/mp4",
      size: MULTIPART_THRESHOLD_BYTES + 1,
      durationSeconds: 120,
    });

    async function ticketFor(input: Record<string, unknown>) {
      const signed = await athleteA1.post(`${mediaUrl}/upload-url`).send(input);
      expect(signed.status).toBe(201);
      return signed.body;
    }

    // `content-type` n'est PAS envoyé : `UploadPartCommand` ne le signe pas (le type de l'objet
    // est fixé à l'ouverture de l'upload). Seul `content-length` l'est, et undici le calcule.
    async function putPart(url: string, size: number): Promise<number> {
      const put = await fetch(url, { method: "PUT", body: Buffer.alloc(size, 1) });
      return put.status;
    }

    beforeAll(async () => {
      const plan = await coachA.post("/plans").send({
        athleteId: a1Id,
        title: "Cycle envoi découpé",
        startDate: monday,
        weeks: [{ type: "TRAINING" }],
      });
      const session = await coachA
        .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
        .send({ title: "Séance vidéo longue", scheduledDate: monday });
      await billAndPublish(coachA, plan.body.id);

      bigSessionId = session.body.id;
      mediaUrl = `/me/scheduled-sessions/${bigSessionId}/feedback/media`;
    });

    it("bascule en découpé au-delà du seuil, et pas avant", async () => {
      // Le seuil est INCLUSIF : pile dessus, le PUT unique passe encore.
      const single = await ticketFor({ ...video("juste.mp4"), size: MULTIPART_THRESHOLD_BYTES });
      expect(single.mode).toBe("SINGLE");
      expect(single.uploadUrl).toBeDefined();

      const multi = await ticketFor(bigVideo());
      expect(multi.mode).toBe("MULTIPART");
      expect(multi.partSize).toBe(MULTIPART_PART_SIZE_BYTES);
      const expectedParts = multipartPartCount(MULTIPART_THRESHOLD_BYTES + 1);
      expect(expectedParts).not.toBeNull();
      expect(multi.partUrls).toHaveLength(expectedParts ?? 0);
      // Le mode dicte la forme : aucun `uploadUrl` unique à envoyer par erreur.
      expect(multi.uploadUrl).toBeUndefined();
    });

    it("parcours complet : parts, clôture, puis rattachement", async () => {
      const input = bigVideo("parcours.mp4");
      const ticket = await ticketFor(input);
      const sizes = multipartPartSizes(input.size) ?? [];

      for (const [index, partUrl] of (ticket.partUrls as string[]).entries()) {
        expect(await putPart(partUrl, sizes[index] ?? 0)).toBe(200);
      }

      const completed = await athleteA1.post(`${mediaUrl}/upload/complete`).send({
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        partCount: ticket.partUrls.length,
      });
      expect(completed.status).toBe(204);

      // L'objet recollé se rattache comme n'importe quel média : le découpage ne se voit plus.
      const attached = await athleteA1
        .post(mediaUrl)
        .send({ ...input, storagePath: ticket.storagePath });
      expect(attached.status).toBe(201);
    });

    /**
     * LE test de ce commit. S3 recolle sans broncher ce qu'on lui donne : sans ce refus, une part
     * perdue produirait une vidéo tronquée que rien ne distingue d'une vidéo entière — ni le
     * storage, ni le rattachement, ni la lecture par le coach.
     */
    it("refuse de clore un upload auquel il manque une part (409)", async () => {
      const input = bigVideo("tronquee.mp4");
      const ticket = await ticketFor(input);
      const sizes = multipartPartSizes(input.size) ?? [];

      expect(await putPart(ticket.partUrls[0], sizes[0] ?? 0)).toBe(200);

      const completed = await athleteA1.post(`${mediaUrl}/upload/complete`).send({
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        // Une seule part envoyée, mais on prétend les avoir toutes montées.
        partCount: ticket.partUrls.length,
      });
      expect(completed.status).toBe(409);
    });

    it("l'abandon purge les parts, et la clôture répond alors 404", async () => {
      const input = bigVideo("abandonnee.mp4");
      const ticket = await ticketFor(input);
      const sizes = multipartPartSizes(input.size) ?? [];
      expect(await putPart(ticket.partUrls[0], sizes[0] ?? 0)).toBe(200);

      const aborted = await athleteA1
        .post(`${mediaUrl}/upload/abort`)
        .send({ storagePath: ticket.storagePath, uploadId: ticket.uploadId });
      expect(aborted.status).toBe(204);

      const completed = await athleteA1.post(`${mediaUrl}/upload/complete`).send({
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        partCount: 1,
      });
      expect(completed.status).toBe(404);
    });

    /**
     * Le `storagePath` de la clôture est la SEULE entrée de ce module qui désigne un objet du
     * bucket sans être construite par l'API. Le tenancy guard protège la base, pas le storage.
     */
    it("refuse un chemin de storage hors du périmètre de la séance (403)", async () => {
      const ticket = await ticketFor(bigVideo("evasion.mp4"));

      const completed = await athleteA1.post(`${mediaUrl}/upload/complete`).send({
        storagePath: "athlete/quelqu-un-dautre/feedback/ailleurs/objet.mp4",
        uploadId: ticket.uploadId,
        partCount: 1,
      });
      expect(completed.status).toBe(403);
    });

    it("un athlète ne clôt ni n'abandonne l'upload d'un autre", async () => {
      const ticket = await ticketFor(bigVideo("convoitee.mp4"));
      const payload = {
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        partCount: 1,
      };

      // 404 et non 403 : la séance elle-même n'existe pas pour B1.
      expect((await athleteB1.post(`${mediaUrl}/upload/complete`).send(payload)).status).toBe(404);
      expect(
        (
          await athleteB1
            .post(`${mediaUrl}/upload/abort`)
            .send({ storagePath: ticket.storagePath, uploadId: ticket.uploadId })
        ).status,
      ).toBe(404);
    });

    it("la clôture reste interdite au coach", async () => {
      const res = await coachA
        .post(`${mediaUrl}/upload/complete`)
        .send({ storagePath: "athlete/x/feedback/y/z.mp4", uploadId: "u", partCount: 1 });
      expect(res.status).toBe(403);
    });
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
    expect((await billAndPublish(c, plan.body.id)).status).toBe(200);

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

    const invitation = await coachA.post("/invitations").send({});
    const accepted = await athleteA1
      .post("/invitations/accept")
      .send({ code: invitation.body.code });

    const plan = await coachA.post("/plans").send({
      athleteId: accepted.body.athleteId,
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

describe("Messagerie : fil texte & isolation (P5)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let athleteB1: Agent;
  let autonome: Agent;
  let a1Id: string;
  let coachAId: string;
  let conversationId: string;

  async function link(
    coach: Agent,
    athlete: Agent,
  ): Promise<{ athleteId: string; coachId: string }> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    expect(accepted.status).toBe(201);
    return { athleteId: accepted.body.athleteId, coachId: accepted.body.coachId };
  }

  beforeAll(async () => {
    coachA = await signUp("msg-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("msg-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("msg-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("msg-athlete-b1@cmv.test", Role.ATHLETE);
    autonome = await signUp("msg-autonome@cmv.test", Role.ATHLETE);

    const relation = await link(coachA, athleteA1);
    a1Id = relation.athleteId;
    coachAId = relation.coachId;
    await link(coachB, athleteB1);
  });

  it("le coach ouvre un fil avec SON athlète (get-or-create, contrepartie nommée)", async () => {
    const res = await coachA.post("/conversations").send({ athleteId: a1Id });
    expect(res.status).toBe(201);
    expect(res.body.counterpartId).toBe(a1Id);
    expect(res.body.counterpartName).toBe("msg-athlete-a1@cmv.test");
    expect(res.body.lastMessageAt).toBeNull();
    expect(res.body.unreadCount).toBe(0);
    conversationId = res.body.id;

    // Idempotent : réouvrir renvoie le MÊME fil, pas un doublon.
    const again = await coachA.post("/conversations").send({ athleteId: a1Id });
    expect(again.body.id).toBe(conversationId);
  });

  it("l'athlète ouvre SON fil (même conversation, contrepartie = le coach)", async () => {
    const res = await athleteA1.post("/conversations").send({});
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(conversationId);
    expect(res.body.counterpartId).toBe(coachAId);
    expect(res.body.counterpartName).toBe("msg-coach-a@cmv.test");
  });

  it("le coach ne peut pas ouvrir un fil avec l'athlète d'un autre coach (400)", async () => {
    const res = await coachA.post("/conversations").send({ athleteId: "unknown-athlete-id" });
    expect(res.status).toBe(400);
  });

  it("un athlète autonome (0 coach) n'a pas de messagerie (400)", async () => {
    const res = await autonome.post("/conversations").send({});
    expect(res.status).toBe(400);
  });

  it("le coach envoie un message texte ; l'athlète le lit dans le fil", async () => {
    const sent = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Salut, prêt pour la séance ?" });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      conversationId,
      senderId: coachAId,
      type: "TEXT",
      content: "Salut, prêt pour la séance ?",
      media: null,
      readAt: null,
    });

    const list = await athleteA1.get(`/conversations/${conversationId}/messages`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(sent.body.id);
  });

  it("le dernier message et le non-lu remontent dans la liste de l'athlète", async () => {
    const list = await athleteA1.get("/conversations");
    expect(list.status).toBe(200);
    const fil = list.body.find((c: { id: string }) => c.id === conversationId);
    expect(fil.lastMessageType).toBe("TEXT");
    expect(fil.lastMessagePreview).toBe("Salut, prêt pour la séance ?");
    expect(fil.lastMessageAt).not.toBeNull();
    // Message entrant non lu côté athlète.
    expect(fil.unreadCount).toBe(1);
  });

  it("l'expéditeur ne compte pas ses propres messages comme non lus", async () => {
    const list = await coachA.get("/conversations");
    const fil = list.body.find((c: { id: string }) => c.id === conversationId);
    expect(fil.unreadCount).toBe(0);
  });

  it("marquer lu remet le compteur à zéro (idempotent)", async () => {
    const read = await athleteA1.post(`/conversations/${conversationId}/read`);
    expect(read.status).toBe(204);

    const list = await athleteA1.get("/conversations");
    const fil = list.body.find((c: { id: string }) => c.id === conversationId);
    expect(fil.unreadCount).toBe(0);

    // Rien à relire une seconde fois.
    expect((await athleteA1.post(`/conversations/${conversationId}/read`)).status).toBe(204);
  });

  it("l'athlète répond ; le message est aligné sur son id d'expéditeur", async () => {
    const reply = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Oui, j'arrive." });
    expect(reply.status).toBe(201);
    expect(reply.body.senderId).toBe(a1Id);

    // Réciproque : le coach a maintenant un message entrant non lu.
    const list = await coachA.get("/conversations");
    const fil = list.body.find((c: { id: string }) => c.id === conversationId);
    expect(fil.unreadCount).toBe(1);
  });

  it("un fil d'un autre tenant est invisible et inaccessible", async () => {
    // coachB ne voit pas le fil de coachA.
    expect((await coachB.get("/conversations")).body).toEqual([]);
    // Ni ses messages, ni l'envoi, ni le marquage lu (scope tenant → 404).
    expect((await coachB.get(`/conversations/${conversationId}/messages`)).status).toBe(404);
    expect(
      (
        await coachB.post(`/conversations/${conversationId}/messages`).send({
          type: "TEXT",
          content: "intrusion",
        })
      ).status,
    ).toBe(404);
    expect((await coachB.post(`/conversations/${conversationId}/read`)).status).toBe(404);
  });

  it("le pipe de validation rejette un texte vide (400)", async () => {
    const res = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "" });
    expect(res.status).toBe(400);
  });
});

describe("Messagerie : médias (P5)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let conversationId: string;

  const audio = (fileName = "note.m4a") => ({
    type: "AUDIO",
    fileName,
    mimeType: "audio/m4a",
    size: 200_000,
    durationSeconds: 12,
  });
  const image = (fileName = "photo.jpg") => ({
    type: "IMAGE",
    fileName,
    mimeType: "image/jpeg",
    size: 120_000,
  });

  async function link(coach: Agent, athlete: Agent): Promise<string> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    return accepted.body.athleteId;
  }

  // Parcours réel : URL signée → PUT direct vers le storage → envoi du message.
  async function upload(agent: Agent, input: Record<string, unknown>): Promise<string> {
    const signed = await agent
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send(input);
    expect(signed.status).toBe(201);

    // `content-length` calculé par undici depuis le corps : l'URL étant signée avec la taille
    // annoncée, l'upload ne passe que si le poids réel correspond.
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
    coachA = await signUp("msgm-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("msgm-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("msgm-coach-b@cmv.test", Role.COACH);

    const a1Id = await link(coachA, athleteA1);
    const opened = await coachA.post("/conversations").send({ athleteId: a1Id });
    conversationId = opened.body.id;
  });

  it("envoie une note vocale : URL de lecture signée, durée conservée", async () => {
    const storagePath = await upload(coachA, audio());
    const sent = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ ...audio(), storagePath });
    expect(sent.status).toBe(201);
    expect(sent.body.type).toBe("AUDIO");
    expect(sent.body.content).toBeNull();
    expect(sent.body.media).toMatchObject({
      fileName: "note.m4a",
      mimeType: "audio/m4a",
      sizeBytes: 200_000,
      durationSeconds: 12,
    });
    // Média = fichier privé : l'URL de lecture est toujours signée, jamais publique.
    expect(sent.body.media.url).toContain("X-Amz-Signature");

    const list = await athleteA1.get(`/conversations/${conversationId}/messages`);
    expect(list.body.at(-1).id).toBe(sent.body.id);
  });

  it("envoie une image : pas de durée, clé segmentée par conversation", async () => {
    const storagePath = await upload(athleteA1, image());
    expect(storagePath).toContain(`conversation/${conversationId}/`);

    const sent = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ ...image(), storagePath });
    expect(sent.status).toBe(201);
    expect(sent.body.type).toBe("IMAGE");
    expect(sent.body.media.durationSeconds).toBeNull();
  });

  // Sans la taille dans la signature, un client pourrait déclarer 200 Ko puis pousser plus lourd :
  // le plafond du schéma ne serait qu'une politesse.
  it("le storage refuse un envoi plus lourd que la taille signée", async () => {
    const signed = await coachA
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send(audio("menteuse.m4a"));
    expect(signed.status).toBe(201);

    const tooBig = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(500_000, 1),
      headers: { "content-type": "audio/m4a" },
    });
    expect(tooBig.status).not.toBe(200);
  });

  it("le schéma rejette un mime audio non supporté et une durée hors plafond (400)", async () => {
    const badMime = await coachA
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send({ ...audio(), mimeType: "audio/ogg" });
    expect(badMime.status).toBe(400);

    const tooLong = await coachA
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send({ ...audio(), durationSeconds: 301 });
    expect(tooLong.status).toBe(400);
  });

  it("un tiers ne peut pas demander d'URL d'upload sur ce fil (404)", async () => {
    const res = await coachB
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send(audio());
    expect(res.status).toBe(404);
  });

  /**
   * Envoi découpé dans un fil. Le storage lui-même est déjà couvert côté débrief : on vérifie ici
   * le CÂBLAGE propre à la messagerie — la clé segmentée par conversation, et la garde qui
   * l'oppose au chemin annoncé par le client.
   */
  describe("upload découpé", () => {
    const bigVideo = (fileName = "longue.mp4") => ({
      type: "VIDEO",
      fileName,
      mimeType: "video/mp4",
      // La plus petite vidéo qui force le découpage : un octet de plus que le seuil.
      size: MULTIPART_THRESHOLD_BYTES + 1,
      durationSeconds: 120,
    });

    async function ticketFor(input: Record<string, unknown>) {
      const signed = await athleteA1
        .post(`/conversations/${conversationId}/messages/upload-url`)
        .send(input);
      expect(signed.status).toBe(201);
      return signed.body;
    }

    it("parcours complet : parts, clôture, puis message", async () => {
      const input = bigVideo("parcours.mp4");
      const ticket = await ticketFor(input);
      expect(ticket.mode).toBe("MULTIPART");
      // La clé reste segmentée par CONVERSATION (le fichier appartient au fil, pas à un athlète).
      expect(ticket.storagePath).toContain(`conversation/${conversationId}/`);

      const sizes = multipartPartSizes(input.size) ?? [];
      for (const [index, partUrl] of (ticket.partUrls as string[]).entries()) {
        // Pas de `content-type` : `UploadPartCommand` ne le signe pas.
        const put = await fetch(partUrl, {
          method: "PUT",
          body: Buffer.alloc(sizes[index] ?? 0, 1),
        });
        expect(put.status).toBe(200);
      }

      const completed = await athleteA1
        .post(`/conversations/${conversationId}/messages/upload/complete`)
        .send({
          storagePath: ticket.storagePath,
          uploadId: ticket.uploadId,
          partCount: ticket.partUrls.length,
        });
      expect(completed.status).toBe(204);

      // L'objet recollé s'envoie comme n'importe quel média : le découpage ne se voit plus.
      const sent = await athleteA1
        .post(`/conversations/${conversationId}/messages`)
        .send({ ...input, storagePath: ticket.storagePath });
      expect(sent.status).toBe(201);
      expect(sent.body.type).toBe("VIDEO");
      expect(sent.body.media.url).toContain("X-Amz-Signature");
    });

    it("refuse un chemin de storage hors du périmètre du fil (403)", async () => {
      const ticket = await ticketFor(bigVideo("evasion.mp4"));

      const completed = await athleteA1
        .post(`/conversations/${conversationId}/messages/upload/complete`)
        .send({
          storagePath: "conversation/un-autre-fil/objet.mp4",
          uploadId: ticket.uploadId,
          partCount: 1,
        });
      expect(completed.status).toBe(403);
    });

    it("un tiers ne clôt ni n'abandonne l'upload de ce fil (404)", async () => {
      const ticket = await ticketFor(bigVideo("convoitee.mp4"));
      const payload = {
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        partCount: 1,
      };

      // 404 et non 403 : le fil lui-même n'existe pas pour coachB.
      expect(
        (
          await coachB
            .post(`/conversations/${conversationId}/messages/upload/complete`)
            .send(payload)
        ).status,
      ).toBe(404);
      expect(
        (
          await coachB.post(`/conversations/${conversationId}/messages/upload/abort`).send({
            storagePath: ticket.storagePath,
            uploadId: ticket.uploadId,
          })
        ).status,
      ).toBe(404);
    });
  });
});

describe("Messagerie : rattachement séance / débrief (P5)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let athleteA2: Agent;
  let conversationId: string;
  let sessionA1Id: string;
  let sessionA2Id: string;
  let draftSessionId: string;
  let feedbackA1Id: string;
  let feedbackA2Id: string;

  const monday = mondayOfCurrentWeek();

  async function link(coach: Agent, athlete: Agent): Promise<string> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    return accepted.body.athleteId;
  }

  // Crée un plan (publié ou non) avec une séance, renvoie l'id de la séance.
  async function sessionInPlan(
    athleteId: string,
    title: string,
    publish: boolean,
  ): Promise<string> {
    const plan = await coachA.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coachA
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title, scheduledDate: monday });
    if (publish) {
      await billAndPublish(coachA, plan.body.id);
    }
    return session.body.id;
  }

  async function debrief(athlete: Agent, sessionId: string): Promise<string> {
    const res = await athlete
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Retour" });
    expect(res.status).toBe(200);
    return res.body.id;
  }

  beforeAll(async () => {
    coachA = await signUp("msga-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("msga-athlete-a1@cmv.test", Role.ATHLETE);
    athleteA2 = await signUp("msga-athlete-a2@cmv.test", Role.ATHLETE);

    const a1Id = await link(coachA, athleteA1);
    const a2Id = await link(coachA, athleteA2);

    sessionA1Id = await sessionInPlan(a1Id, "Séance A1", true);
    sessionA2Id = await sessionInPlan(a2Id, "Séance A2", true);
    draftSessionId = await sessionInPlan(a1Id, "Séance brouillon A1", false);
    feedbackA1Id = await debrief(athleteA1, sessionA1Id);
    feedbackA2Id = await debrief(athleteA2, sessionA2Id);

    const opened = await coachA.post("/conversations").send({ athleteId: a1Id });
    conversationId = opened.body.id;
  });

  it("l'athlète rattache une séance publiée à son message", async () => {
    const res = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "À propos de cette séance", scheduledSessionId: sessionA1Id });
    expect(res.status).toBe(201);
    expect(res.body.scheduledSessionId).toBe(sessionA1Id);
  });

  it("le coach rattache la même séance", async () => {
    const res = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Bien vu", scheduledSessionId: sessionA1Id });
    expect(res.status).toBe(201);
    expect(res.body.scheduledSessionId).toBe(sessionA1Id);
  });

  // Le scope tenant ne filtre PAS le statut : sans la garde du service, l'athlète rattacherait
  // une séance d'un cycle encore en brouillon.
  it("refuse le rattachement d'une séance non diffusée (côté athlète)", async () => {
    const res = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Trop tôt", scheduledSessionId: draftSessionId });
    expect(res.status).toBe(404);
  });

  // Le coach a N athlètes : sa séance d'un AUTRE athlète n'a rien à faire dans ce fil.
  it("refuse une séance d'un autre athlète du même coach (400)", async () => {
    const res = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Mauvais fil", scheduledSessionId: sessionA2Id });
    expect(res.status).toBe(400);
  });

  it("refuse une séance inconnue (400)", async () => {
    const res = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "?", scheduledSessionId: "nope" });
    expect(res.status).toBe(400);
  });

  it("rattache un débrief du fil, mais pas celui d'un autre athlète", async () => {
    const ok = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "J'ai lu ton débrief", sessionFeedbackId: feedbackA1Id });
    expect(ok.status).toBe(201);
    expect(ok.body.sessionFeedbackId).toBe(feedbackA1Id);

    const cross = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Mauvais débrief", sessionFeedbackId: feedbackA2Id });
    expect(cross.status).toBe(400);
  });
});

/**
 * Répondre à un débrief ouvre une LECTURE neuve qui traverse la frontière tenant : les messages
 * rattachés remontent maintenant dans le débrief lui-même, par un second chemin que la messagerie.
 * Toute route neuve a son e2e d'isolation.
 *
 * Ce que l'ÉCRITURE refuse est déjà couvert par « Messagerie : rattachement séance / débrief » —
 * on ne le réécrit pas. Ce qui manque, et qui est ici : la lecture, et la dérivation de
 * « répondu ».
 */
describe("Réponses à un débrief : lecture, isolation et « répondu » (#196)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let athleteB1: Agent;
  let sessionA1Id: string;
  let sessionB1Id: string;
  let feedbackA1Id: string;
  let feedbackA1bisId: string;
  let feedbackB1Id: string;
  let conversationAId: string;

  const monday = mondayOfCurrentWeek();

  const byId = (feedbacks: { id: string; repliedAt: string | null }[], id: string) =>
    required(
      feedbacks.find((feedback) => feedback.id === id),
      `débrief ${id} absent de la liste du coach`,
    );

  async function link(coach: Agent, athlete: Agent): Promise<string> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    return accepted.body.athleteId;
  }

  // Un cycle diffusé avec une séance, débriefé par son athlète. Renvoie séance et débrief.
  async function debriefedSession(
    coach: Agent,
    athlete: Agent,
    athleteId: string,
    title: string,
  ): Promise<{ sessionId: string; feedbackId: string }> {
    const plan = await coach
      .post("/plans")
      .send({ athleteId, title, startDate: monday, weeks: [{ type: "TRAINING" }] });
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title, scheduledDate: monday });
    await billAndPublish(coach, plan.body.id);
    const feedback = await athlete
      .put(`/me/scheduled-sessions/${session.body.id}/feedback`)
      .send({ content: "Retour" });
    expect(feedback.status).toBe(200);
    return { sessionId: session.body.id, feedbackId: feedback.body.id };
  }

  beforeAll(async () => {
    coachA = await signUp("rep-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("rep-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("rep-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("rep-athlete-b1@cmv.test", Role.ATHLETE);

    const a1Id = await link(coachA, athleteA1);
    const b1Id = await link(coachB, athleteB1);

    const a = await debriefedSession(coachA, athleteA1, a1Id, "Séance A1");
    sessionA1Id = a.sessionId;
    feedbackA1Id = a.feedbackId;
    // Un SECOND débrief du même athlète : celui-ci reste vierge de réponse du coach jusqu'au test
    // de « répondu », qui a besoin d'un débrief dont l'ordre des messages est maîtrisé.
    feedbackA1bisId = (await debriefedSession(coachA, athleteA1, a1Id, "Séance A1 bis")).feedbackId;
    const b = await debriefedSession(coachB, athleteB1, b1Id, "Séance B1");
    sessionB1Id = b.sessionId;
    feedbackB1Id = b.feedbackId;

    const opened = await coachA.post("/conversations").send({ athleteId: a1Id });
    conversationAId = opened.body.id;
  });

  it("rend les messages rattachés au coach ET à l'athlète, par leurs routes respectives", async () => {
    const sent = await coachA
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Bien joué", sessionFeedbackId: feedbackA1Id });
    expect(sent.status).toBe(201);

    // Le coach lit le débrief de son athlète, l'athlète lit le sien : deux routes, un seul
    // enregistrement — jamais une copie.
    const coachSide = await coachA.get(`/scheduled-sessions/${sessionA1Id}/feedback`);
    const athleteSide = await athleteA1.get(`/me/scheduled-sessions/${sessionA1Id}/feedback`);
    expect(coachSide.body.messages.map((m: { id: string }) => m.id)).toEqual([sent.body.id]);
    expect(athleteSide.body.messages.map((m: { id: string }) => m.id)).toEqual([sent.body.id]);
  });

  /**
   * Le libellé du rattachement est résolu par une requête SCOPÉE, jamais par un `include` — un
   * include imbriqué échappe au scope tenant et ferait remonter la cible sans filtre. Ici la cible
   * est dans la relation, donc le libellé EST rendu : c'est ce qui prouve que le test suivant
   * mesure une fermeture, et non une résolution cassée pour tout le monde.
   */
  it("résout le libellé du rattachement pour qui a le droit de lire la cible", async () => {
    const thread = await coachA.get(`/conversations/${conversationAId}/messages`);
    const attached = thread.body.find(
      (m: { sessionFeedbackId: string | null }) => m.sessionFeedbackId === feedbackA1Id,
    );
    expect(attached.attachment).toMatchObject({
      type: "SESSION_FEEDBACK",
      id: feedbackA1Id,
      scheduledSessionId: sessionA1Id,
      sessionTitle: "Séance A1",
    });
  });

  it("un coach ne lit pas le débrief — ni ses réponses — d'un athlète qui n'est pas le sien", async () => {
    // `null` et non 404 : l'absence de débrief est un état normal de cette route. Ce qui compte
    // est qu'aucune charge utile ne sorte, donc aucun message rattaché.
    const res = await coachB.get(`/scheduled-sessions/${sessionA1Id}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  /**
   * `200` + `null`, et non 404 : la route rend déjà `null` sur une séance jamais débriefée, et
   * c'est exactement ce qu'on veut ici. Un athlète ne peut PAS distinguer « le débrief d'un autre »
   * de « pas encore débriefé » — un 404 lui apprendrait que la séance existe.
   */
  it("un athlète ne distingue pas le débrief d'un autre d'une séance jamais débriefée", async () => {
    const res = await athleteB1.get(`/me/scheduled-sessions/${sessionA1Id}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  /**
   * « Répondu » ne compte QUE les messages du coach. Un athlète qui écrit sur son propre débrief
   * ne le marque pas traité — sinon la boîte de réception dirait « répondu » sur ce que le coach
   * n'a pas encore lu.
   *
   * L'ordre compte, et c'est tout l'objet du test : l'athlète écrit EN PREMIER. L'inverse
   * laisserait passer une implémentation qui retient simplement le message le plus ancien.
   */
  it("« répondu » ignore un message de l'athlète et retient le premier du coach", async () => {
    const athleteFirst = await athleteA1
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Une précision", sessionFeedbackId: feedbackA1bisId });
    expect(athleteFirst.status).toBe(201);

    const afterAthlete = await coachA.get("/feedbacks");
    expect(byId(afterAthlete.body, feedbackA1bisId).repliedAt).toBeNull();

    const coachReply = await coachA
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Reçu", sessionFeedbackId: feedbackA1bisId });
    expect(coachReply.status).toBe(201);

    const afterCoach = await coachA.get("/feedbacks");
    // La date est celle du message du COACH, pas celle du premier message du fil.
    expect(byId(afterCoach.body, feedbackA1bisId).repliedAt).toBe(coachReply.body.createdAt);
  });

  /**
   * Le refus d'un rattachement hors relation ne doit rien laisser derrière lui : ni message
   * orphelin de son contexte, ni entrée dans le fil. C'est le seul point de l'écriture que le
   * describe « rattachement » ne vérifiait pas.
   */
  it("refuse un débrief d'une AUTRE relation, sans rien écrire", async () => {
    const before = await coachA.get(`/conversations/${conversationAId}/messages`);

    const refused = await coachA
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Chez le voisin", sessionFeedbackId: feedbackB1Id });
    expect(refused.status).toBe(400);

    const after = await coachA.get(`/conversations/${conversationAId}/messages`);
    expect(after.body.length).toBe(before.body.length);
  });

  it("le débrief jamais répondu n'a ni réponse ni date", async () => {
    const feedbacks = await coachB.get("/feedbacks");
    const untouched = feedbacks.body.find((f: { id: string }) => f.id === feedbackB1Id);
    expect(untouched.repliedAt).toBeNull();
    expect((await coachB.get(`/scheduled-sessions/${sessionB1Id}/feedback`)).body.messages).toEqual(
      [],
    );
  });
});

describe("Facturation liée au cycle : brouillon, émission & isolation (P6)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let athleteB1: Agent;
  let a1Id: string;
  let coachAId: string;
  let planId: string;
  let invoiceId: string;

  const monday = mondayOfCurrentWeek();

  async function link(
    coach: Agent,
    athlete: Agent,
  ): Promise<{ athleteId: string; coachId: string }> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    expect(accepted.status).toBe(201);
    return { athleteId: accepted.body.athleteId, coachId: accepted.body.coachId };
  }

  beforeAll(async () => {
    coachA = await signUp("inv-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("inv-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("inv-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("inv-athlete-b1@cmv.test", Role.ATHLETE);

    const relation = await link(coachA, athleteA1);
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
    const res = await coachA.post(`/plans/${planId}/publish`);
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

    // PUT direct vers le storage (MinIO), taille signée opposable — comme les médias de débrief.
    const put = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(20_000, 1),
      headers: { "content-type": "application/pdf" },
    });
    expect(put.status).toBe(200);

    const attached = await coachA.put(`/plans/${planId}/billing/document`).send({
      storagePath: signed.body.storagePath,
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

  it("diffuser le cycle émet la facture (DRAFT → PENDING) et notifie l'athlète", async () => {
    const res = await coachA.post(`/plans/${planId}/publish`);
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

  it("la facturation est figée une fois le cycle diffusé", async () => {
    const res = await coachA
      .put(`/plans/${planId}/billing`)
      .send({ amountCents: 9999, dueDate: monday });
    expect(res.status).toBe(400);
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

    const invitation = await coachA.post("/invitations").send({});
    const accepted = await athleteA1
      .post("/invitations/accept")
      .send({ code: invitation.body.code });
    a1Id = accepted.body.athleteId;

    const invitationB = await coachB.post("/invitations").send({});
    await athleteB1.post("/invitations/accept").send({ code: invitationB.body.code });

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
    const list = await inbox(athleteA1);
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

  it("l'émetteur n'est pas destinataire : le coach n'a rien reçu de sa propre diffusion", async () => {
    expect(await inbox(coachA)).toHaveLength(0);
    expect(await unread(coachA)).toBe(0);
  });

  it("ajuster une séance diffusée notifie l'athlète, avec le titre de la séance", async () => {
    const adjusted = await coachA.put(`/scheduled-sessions/${sessionId}`).send({
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

    expect((await coachA.delete(`/scheduled-sessions/${added.body.id}`)).status).toBe(204);

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
    expect((await coachA.delete(`/scheduled-sessions/${session.body.id}`)).status).toBe(204);

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

  // Le throttle push de P5-4 vaut aussi pour la trace : on notifie au passage « tout lu » →
  // « non lu », donc une rafale de messages ne produit qu'UNE entrée tant que rien n'est lu.
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
    expect(await inbox(athleteB1)).toHaveLength(0);
    expect(await unread(athleteB1)).toBe(0);
    expect(await inbox(coachB)).toHaveLength(0);
  });
});

describe("Rappels du coach (#44)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let a1Id: string;
  let planId: string;
  let invoiceId: string;

  const monday = mondayOfCurrentWeek();
  const inPast = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const inFuture = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  type Rmd = {
    id: string;
    entityType: string;
    entityId: string;
    targetLabel: string | null;
    dueAt: string;
    note: string;
    status: string;
    readAt: string | null;
    updatedAt: string;
  };

  const reminders = async (agent: Agent): Promise<Rmd[]> => (await agent.get("/reminders")).body;
  const summary = async (agent: Agent) => (await agent.get("/reminders/summary")).body;

  beforeAll(async () => {
    coachA = await signUp("rmd-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("rmd-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("rmd-athlete-a1@cmv.test", Role.ATHLETE);

    const invitation = await coachA.post("/invitations").send({});
    const accepted = await athleteA1
      .post("/invitations/accept")
      .send({ code: invitation.body.code });
    a1Id = accepted.body.athleteId;

    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle à renouveler",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;
    // Diffusé pour disposer d'une facture ÉMISE, l'autre cible offerte par l'UI.
    expect((await billAndPublish(coachA, planId)).status).toBe(200);
    invoiceId = (await coachA.get("/invoices")).body[0].id;
  });

  it("crée un rappel sur un cycle : la cible est nommée, le rappel est à traiter", async () => {
    const res = await coachA.post("/reminders").send({
      entityType: "PLAN",
      entityId: planId,
      dueAt: inFuture(24),
      note: "Relancer le renouvellement",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      entityType: "PLAN",
      entityId: planId,
      // Libellé BRUT (le titre du cycle) : le client compose et traduit.
      targetLabel: "Cycle à renouveler",
      note: "Relancer le renouvellement",
      status: "PENDING",
      readAt: null,
    });
  });

  it("crée un rappel sur une facture : la cible est nommée par sa période", async () => {
    const res = await coachA.post("/reminders").send({
      entityType: "INVOICE",
      entityId: invoiceId,
      dueAt: inPast(2),
      note: "Facture impayée",
    });

    expect(res.status).toBe(201);
    expect(res.body.entityType).toBe("INVOICE");
    // La période du mois facturé, dérivée du cycle — pas un libellé rendu côté API.
    expect(res.body.targetLabel).toBe(monday.slice(0, 7));
  });

  /**
   * Deux rappels à traiter, dont UN seul est dû (l'autre échoit dans 24 h). Les deux compteurs
   * s'emboîtent — ils ne se complètent pas : les afficher côte à côte montrerait deux fois le même
   * rappel en retard. C'est pourquoi le dashboard n'expose que `dueCount`.
   */
  it("le résumé compte les rappels dus, sous-ensemble des rappels à traiter", async () => {
    expect(await summary(coachA)).toEqual({ dueCount: 1, pendingCount: 2 });
  });

  /**
   * LE test qui protège la décision de #111 : `readAt` (« vu dans le centre ») n'est pas le statut
   * (« traité »). Le badge de la cloche, lui, ne compte que les dus NON LUS — si `dueCount` faisait
   * pareil, dérouler ses notifications viderait la tuile « à traiter » sans qu'un seul rappel n'ait
   * été traité.
   */
  it("un rappel dû et VU reste compté : readAt ne vaut pas traité", async () => {
    const due = (await reminders(coachA)).find((r) => r.note === "Facture impayée");
    expect(due).toBeDefined();

    // Marquage par le centre de notifications, où le rappel dû figure sous un id préfixé.
    const read = await coachA.patch(`/me/notifications/reminder:${due?.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.readAt).not.toBeNull();

    expect(await summary(coachA)).toEqual({ dueCount: 1, pendingCount: 2 });
  });

  /**
   * Le contrôle qui compte : `entityId` n'a pas de clé étrangère, et une FK n'imposerait de toute
   * façon pas le tenant. Sans lui, un coach posait un rappel sur le cycle d'un autre — et en lisait
   * le titre dans `targetLabel`. Le 400 ne distingue pas « absente » de « à quelqu'un d'autre ».
   */
  it("refuse une cible qui n'est pas au coach courant (400)", async () => {
    // Une cible EXISTANTE, mais appartenant à un autre coach : c'est le cas qui compte. Sans le
    // contrôle, coachB posait un rappel sur la facture de coachA et en lisait la période.
    const stolenPlan = await coachB
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: planId, dueAt: inFuture(1), note: "x" });
    expect(stolenPlan.status).toBe(400);

    const stolenInvoice = await coachB
      .post("/reminders")
      .send({ entityType: "INVOICE", entityId: invoiceId, dueAt: inFuture(1), note: "x" });
    expect(stolenInvoice.status).toBe(400);

    // Et une cible qui n'existe nulle part : même refus, même message — dire à un coach qu'un id
    // existe ailleurs serait déjà une fuite.
    const unknown = await coachA
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: "pln_inexistant", dueAt: inFuture(1), note: "x" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toBe(stolenPlan.body.message);
  });

  it("le schéma partagé rejette une note vide, une échéance sans heure, un tenant transmis", async () => {
    const base = { entityType: "PLAN", entityId: planId, dueAt: inFuture(1) };
    expect((await coachA.post("/reminders").send({ ...base, note: "" })).status).toBe(400);
    // `dueAt` est un INSTANT : une date civile ne laisserait pas l'API choisir un fuseau.
    expect(
      (await coachA.post("/reminders").send({ ...base, dueAt: monday, note: "x" })).status,
    ).toBe(400);
    // .strict() : le tenant est injecté, jamais transmis.
    expect(
      (await coachA.post("/reminders").send({ ...base, note: "x", coachId: a1Id })).status,
    ).toBe(400);
  });

  /**
   * Un rappel est un outil PRIVÉ du coach : `Reminder` n'a aucun scope athlète. Le 403 vient du
   * `@Roles` du contrôleur — sans lui, la requête atteindrait l'extension Prisma, qui refuse par une
   * ERREUR, et l'athlète recevrait un 500.
   */
  it("l'athlète n'a aucun accès aux rappels (403, jamais 500)", async () => {
    expect((await athleteA1.get("/reminders")).status).toBe(403);
    // Le résumé est sous le même `@Roles` de classe : un athlète ne doit pas plus compter les
    // rappels que les lire. Sans la garde, l'extension Prisma lèverait — un 500, pas un 403.
    expect((await athleteA1.get("/reminders/summary")).status).toBe(403);
    expect(
      (
        await athleteA1
          .post("/reminders")
          .send({ entityType: "PLAN", entityId: planId, dueAt: inFuture(1), note: "x" })
      ).status,
    ).toBe(403);
    const mine = required((await reminders(coachA))[0], "rappel du coach A");
    expect(
      (await athleteA1.patch(`/reminders/${mine.id}/status`).send({ status: "DONE" })).status,
    ).toBe(403);
  });

  /**
   * L'ordre est imposé par l'API pour que le client segmente sans retrier : à traiter d'abord, le
   * plus en retard en tête. Et les deux segments sont bornés SÉPARÉMENT — sur une seule liste bornée,
   * une pile de rappels traités pousserait les rappels à traiter hors de la borne.
   */
  it("liste les rappels à traiter d'abord, le plus en retard en tête", async () => {
    const list = await reminders(coachA);
    expect(list.every((r) => r.status === "PENDING")).toBe(true);
    expect(required(list[0], "rappel en tête").note).toBe("Facture impayée"); // dû il y a 2 h
    expect(required(list[1], "2e rappel").note).toBe("Relancer le renouvellement"); // dû dans 24 h
  });

  it("marque fait, puis rouvre : le toggle est réversible dans les deux sens", async () => {
    const target = required((await reminders(coachA))[0], "rappel à basculer");

    const done = await coachA.patch(`/reminders/${target.id}/status`).send({ status: "DONE" });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("DONE");

    const reopened = await coachA
      .patch(`/reminders/${target.id}/status`)
      .send({ status: "PENDING" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("PENDING");
  });

  // Sans idempotence, un rappel traité remonterait en tête de l'historique à chaque clic répété.
  it("remarquer le même statut ne redate pas le rappel", async () => {
    const target = required((await reminders(coachA))[0], "rappel à re-marquer");
    const first = await coachA
      .patch(`/reminders/${target.id}/status`)
      .send({ status: "DISMISSED" });
    const again = await coachA
      .patch(`/reminders/${target.id}/status`)
      .send({ status: "DISMISSED" });

    expect(again.body.updatedAt).toBe(first.body.updatedAt);
  });

  /**
   * Le rappel en retard vient d'être abandonné : il sort des DEUX compteurs. Reste celui qui échoit
   * dans 24 h — à traiter, mais pas encore dû. C'est ce qui distingue les deux nombres.
   */
  it("un rappel traité sort des deux compteurs", async () => {
    expect(await summary(coachA)).toEqual({ dueCount: 0, pendingCount: 1 });
  });

  it("refuse un statut inconnu (400)", async () => {
    const target = required((await reminders(coachA))[0], "rappel au statut inconnu");
    expect(
      (await coachA.patch(`/reminders/${target.id}/status`).send({ status: "SNOOZED" })).status,
    ).toBe(400);
  });

  it("isolation : un autre coach ne voit ni ne marque le rappel (404)", async () => {
    const mine = required((await reminders(coachA))[0], "rappel du coach A");
    expect(await reminders(coachB)).toHaveLength(0);
    // Le résumé est scopé comme la liste : compter n'est pas un contournement de la lecture.
    expect(await summary(coachB)).toEqual({ dueCount: 0, pendingCount: 0 });
    expect(
      (await coachB.patch(`/reminders/${mine.id}/status`).send({ status: "DONE" })).status,
    ).toBe(404);
  });

  /**
   * Le point où le raisonnement de la dette N-4 ne suffit pas : contrairement à une notification, un
   * rappel a un vrai chemin vers la cible disparue — un cycle DRAFT se supprime. La facture DRAFT du
   * cycle part en cascade, donc son rappel aussi.
   */
  it("supprimer un cycle purge les rappels qui le visaient, lui et sa facture", async () => {
    const draft = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle éphémère",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const draftPlanId = draft.body.id;
    await coachA
      .put(`/plans/${draftPlanId}/billing`)
      .send({ amountCents: 4000, dueDate: "2026-02-05" });
    const draftInvoiceId = (await coachA.get(`/plans/${draftPlanId}/billing`)).body.id;

    for (const target of [
      { entityType: "PLAN", entityId: draftPlanId },
      { entityType: "INVOICE", entityId: draftInvoiceId },
    ]) {
      expect(
        (await coachA.post("/reminders").send({ ...target, dueAt: inFuture(6), note: "à purger" }))
          .status,
      ).toBe(201);
    }
    expect((await reminders(coachA)).filter((r) => r.note === "à purger")).toHaveLength(2);

    expect((await coachA.delete(`/plans/${draftPlanId}`)).status).toBe(204);
    expect((await reminders(coachA)).filter((r) => r.note === "à purger")).toHaveLength(0);
  });
});

describe("Rappels dus dans le centre de notifications (#51)", () => {
  let coachC: Agent;
  let coachD: Agent;
  let athleteC1: Agent;
  let c1Id: string;
  let planId: string;
  let sessionId: string;
  let dueId: string;
  let upcomingId: string;

  const monday = mondayOfCurrentWeek();
  const inPast = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const inFuture = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  type Entry = {
    id: string;
    type: string;
    entityType: string;
    entityId: string;
    actorName: string | null;
    subjectLabel: string | null;
    readAt: string | null;
    createdAt: string;
  };

  const inbox = async (agent: Agent): Promise<Entry[]> =>
    (await agent.get("/me/notifications")).body;
  const unread = async (agent: Agent): Promise<number> =>
    (await agent.get("/me/notifications/unread-count")).body.count;
  const reminderOf = async (agent: Agent, id: string) =>
    ((await agent.get("/reminders")).body as { id: string; dueAt: string }[]).find(
      (r) => r.id === id,
    );

  const DUE_NOTE = "Relancer le renouvellement du cycle";

  beforeAll(async () => {
    coachC = await signUp("due-coach-c@cmv.test", Role.COACH);
    coachD = await signUp("due-coach-d@cmv.test", Role.COACH);
    athleteC1 = await signUp("due-athlete-c1@cmv.test", Role.ATHLETE);

    const invitation = await coachC.post("/invitations").send({});
    const accepted = await athleteC1
      .post("/invitations/accept")
      .send({ code: invitation.body.code });
    c1Id = accepted.body.athleteId;

    const plan = await coachC.post("/plans").send({
      athleteId: c1Id,
      title: "Cycle du centre",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;
    const session = await coachC
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: "Séance du centre", scheduledDate: monday });
    sessionId = session.body.id;
    await billAndPublish(coachC, planId);

    // Une VRAIE notification persistée chez le coach, pour vérifier que les deux sources se mêlent.
    await athleteC1
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Séance faite" });

    const due = await coachC
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: planId, dueAt: inPast(1), note: DUE_NOTE });
    dueId = due.body.id;
    const upcoming = await coachC
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: planId, dueAt: inFuture(48), note: "Pas encore dû" });
    upcomingId = upcoming.body.id;
  });

  /**
   * L'entrée est CALCULÉE : aucune ligne `notification` n'existe pour elle (`REMINDER_DUE` n'est même
   * pas dans l'enum Prisma). Son id est préfixé, et son libellé n'est pas stocké — seul le paramètre
   * d'interpolation voyage, comme pour tout le centre.
   */
  it("un rappel dû remonte dans le centre du coach, à côté de ses notifications", async () => {
    const list = await inbox(coachC);
    expect(list.map((e) => e.type)).toContain("FEEDBACK_RECEIVED");

    const entry = list.find((e) => e.type === "REMINDER_DUE");
    expect(entry).toMatchObject({
      id: `reminder:${dueId}`,
      // La cible du rappel, pas un écran « rappels » : le routage des deux clients marche déjà.
      entityType: "PLAN",
      entityId: planId,
      actorName: null, // un rappel n'a pas d'acteur : le coach se le rappelle à lui-même
      subjectLabel: DUE_NOTE,
      readAt: null,
    });
  });

  // Le tri du centre se fait sur `createdAt`, et pour un rappel `createdAt` EST son échéance : il se
  // range au moment où il commence à compter, pas à celui où il a été saisi.
  it("l'entrée est datée de l'échéance du rappel, pas de sa création", async () => {
    const entry = required(
      (await inbox(coachC)).find((e) => e.type === "REMINDER_DUE"),
      "entrée REMINDER_DUE",
    );
    const reminder = required(await reminderOf(coachC, dueId), "rappel dû");
    expect(entry.createdAt).toBe(reminder.dueAt);
  });

  it("un rappel encore à venir ne remonte pas", async () => {
    const entries = (await inbox(coachC)).filter((e) => e.type === "REMINDER_DUE");
    expect(entries).toHaveLength(1);
    expect(required(entries[0], "entrée REMINDER_DUE").id).toBe(`reminder:${dueId}`);
  });

  it("le compteur additionne les notifications non lues et les rappels dus non lus", async () => {
    const list = await inbox(coachC);
    expect(await unread(coachC)).toBe(list.filter((e) => e.readAt == null).length);
  });

  /**
   * Marquer « lu » un rappel dû le sort du badge SANS le traiter : `readAt` dit « vu dans le centre »,
   * `status` dit « traité ». Sans cette distinction, jeter un œil au centre vaudrait « fait ».
   */
  it("marquer un rappel dû comme lu vide son badge sans le traiter", async () => {
    const before = await unread(coachC);

    const res = await coachC.patch(`/me/notifications/reminder:${dueId}/read`);
    expect(res.status).toBe(200);
    expect(res.body.readAt).not.toBeNull();
    expect(await unread(coachC)).toBe(before - 1);

    // Le rappel reste à traiter, et reste dans le centre.
    expect(await reminderOf(coachC, dueId)).toMatchObject({ status: "PENDING" });
    expect((await inbox(coachC)).some((e) => e.id === `reminder:${dueId}`)).toBe(true);
  });

  it("relire un rappel déjà lu ne le redate pas", async () => {
    const first = (await inbox(coachC)).find((e) => e.id === `reminder:${dueId}`);
    const again = await coachC.patch(`/me/notifications/reminder:${dueId}/read`);
    expect(again.body.readAt).toBe(first?.readAt);
  });

  /**
   * Le piège le moins visible du lot : « tout marquer comme lu » ne doit toucher que les rappels
   * DUS. Marquer un rappel à venir éteindrait son badge par avance — le jour de son échéance, il
   * n'annoncerait plus rien.
   */
  it("« tout marquer comme lu » épargne les rappels encore à venir", async () => {
    expect((await coachC.post("/me/notifications/read-all")).status).toBe(204);
    expect(await unread(coachC)).toBe(0);

    expect(await reminderOf(coachC, upcomingId)).toMatchObject({ readAt: null });
  });

  it("traiter un rappel le retire du centre", async () => {
    expect((await coachC.patch(`/reminders/${dueId}/status`).send({ status: "DONE" })).status).toBe(
      200,
    );
    expect((await inbox(coachC)).some((e) => e.type === "REMINDER_DUE")).toBe(false);
  });

  /**
   * Non-régression du piège n°1 : `Reminder` n'a aucun scope athlète, donc lire la table pour un
   * athlète LÈVE au lieu de rendre une liste vide. Sans le branchement par rôle du feed, ces deux
   * requêtes seraient des 500 — sur un écran qui ne parle même pas de rappels.
   */
  it("le centre d'un athlète reste servi (200) et ignore les rappels", async () => {
    const res = await athleteC1.get("/me/notifications");
    expect(res.status).toBe(200);
    expect((res.body as Entry[]).some((e) => e.type === "REMINDER_DUE")).toBe(false);

    const count = await athleteC1.get("/me/notifications/unread-count");
    expect(count.status).toBe(200);
  });

  it("un athlète qui marque un id de rappel obtient un 404, pas un 500", async () => {
    expect((await athleteC1.patch(`/me/notifications/reminder:${dueId}/read`)).status).toBe(404);
  });

  it("isolation : le rappel dû d'un coach n'entre pas dans le centre d'un autre", async () => {
    expect(await inbox(coachD)).toHaveLength(0);
    expect(await unread(coachD)).toBe(0);
    expect((await coachD.patch(`/me/notifications/reminder:${upcomingId}/read`)).status).toBe(404);
  });
});

/**
 * Report d'échéance d'un rappel (#105) — dette R-3.
 *
 * L'enjeu de ce bloc n'est pas la route, c'est le sort de `readAt`. Un rappel dû, VU dans le centre,
 * puis repoussé à la semaine prochaine : s'il revient « déjà lu », son badge ne s'allume jamais le
 * jour où il compte. `readAt` dit « vu à CETTE échéance-là » — il est donc remis à `null` dès que
 * l'échéance bouge, et seulement alors.
 *
 * C'est la même règle que celle appliquée par l'autre bout dans « tout marquer comme lu », qui
 * épargne les rappels encore à venir pour ne pas éteindre leur badge par avance.
 */
describe("Report d'échéance d'un rappel (#105)", () => {
  let coachE: Agent;
  let coachF: Agent;
  let athleteE1: Agent;
  let planId: string;
  let reminderId: string;

  const monday = mondayOfCurrentWeek();
  const inPast = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const inFuture = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  type Rmd = {
    id: string;
    dueAt: string;
    note: string;
    status: string;
    readAt: string | null;
    updatedAt: string;
  };

  const reminderOf = async (agent: Agent, id: string): Promise<Rmd | undefined> =>
    ((await agent.get("/reminders")).body as Rmd[]).find((r) => r.id === id);
  const inboxIds = async (agent: Agent): Promise<string[]> =>
    ((await agent.get("/me/notifications")).body as { id: string }[]).map((e) => e.id);
  const unread = async (agent: Agent): Promise<number> =>
    (await agent.get("/me/notifications/unread-count")).body.count;

  beforeAll(async () => {
    coachE = await signUp("snz-coach-e@cmv.test", Role.COACH);
    coachF = await signUp("snz-coach-f@cmv.test", Role.COACH);
    athleteE1 = await signUp("snz-athlete-e1@cmv.test", Role.ATHLETE);

    const invitation = await coachE.post("/invitations").send({});
    const accepted = await athleteE1
      .post("/invitations/accept")
      .send({ code: invitation.body.code });

    const plan = await coachE.post("/plans").send({
      athleteId: accepted.body.athleteId,
      title: "Cycle à repousser",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;

    // Dû depuis 2 h : il est donc DANS le centre, et non lu.
    const created = await coachE
      .post("/reminders")
      .send({ entityType: "PLAN", entityId: planId, dueAt: inPast(2), note: "Relancer" });
    reminderId = created.body.id;
  });

  it("le rappel dû est bien dans le centre, non lu, avant tout report", async () => {
    expect(await inboxIds(coachE)).toContain(`reminder:${reminderId}`);
    expect(await reminderOf(coachE, reminderId)).toMatchObject({ readAt: null });
  });

  /**
   * LE test de cette issue. Le rappel est d'abord VU dans le centre (`readAt` posé), puis repoussé :
   * il en sort, et son `readAt` est effacé. Sans cet effacement, il reviendrait la semaine prochaine
   * marqué comme lu — silencieux le jour même où il devient utile.
   */
  it("repousser un rappel VU efface son readAt et le sort du centre", async () => {
    expect((await coachE.patch(`/me/notifications/reminder:${reminderId}/read`)).status).toBe(200);
    expect(await reminderOf(coachE, reminderId)).toMatchObject({ readAt: expect.any(String) });

    const res = await coachE.patch(`/reminders/${reminderId}`).send({ dueAt: inFuture(168) });
    expect(res.status).toBe(200);
    expect(res.body.readAt).toBeNull();
    expect(res.body.status).toBe("PENDING"); // repousser ne traite pas

    // Plus dû : il quitte le centre, et cesse d'être compté par le badge.
    expect(await inboxIds(coachE)).not.toContain(`reminder:${reminderId}`);
  });

  /**
   * L'autre moitié de la règle : à sa NOUVELLE échéance, le rappel revient comme une nouveauté. On
   * simule le passage du temps en le repoussant dans le passé — c'est le même chemin de code, et
   * c'est aussi ce qui permet d'avancer volontairement un rappel.
   */
  it("à sa nouvelle échéance, il revient dans le centre comme NON lu", async () => {
    const before = await unread(coachE);

    const res = await coachE.patch(`/reminders/${reminderId}`).send({ dueAt: inPast(1) });
    expect(res.status).toBe(200);
    expect(res.body.readAt).toBeNull();

    expect(await inboxIds(coachE)).toContain(`reminder:${reminderId}`);
    expect(await unread(coachE)).toBe(before + 1);
  });

  /**
   * L'entrée du centre est datée de l'ÉCHÉANCE (#51) : reporter un rappel le déplace donc dans le
   * tri du centre. C'est voulu — un rappel se range au moment où il commence à compter — et ce test
   * fige le fait que le report ne casse pas cet invariant.
   */
  it("l'entrée du centre suit la nouvelle échéance", async () => {
    const reminder = required(await reminderOf(coachE, reminderId), "rappel reporté");
    const entry = (
      (await coachE.get("/me/notifications")).body as { id: string; createdAt: string }[]
    ).find((e) => e.id === `reminder:${reminderId}`);
    expect(required(entry, "entrée du rappel reporté").createdAt).toBe(reminder.dueAt);
  });

  // Corriger la note n'est pas une nouvelle occurrence : le rappel a déjà été vu à cette échéance,
  // le rallumer dans le badge parce qu'on a rectifié une faute de frappe serait du bruit.
  it("corriger la note seule ne touche pas readAt", async () => {
    expect((await coachE.patch(`/me/notifications/reminder:${reminderId}/read`)).status).toBe(200);

    const res = await coachE.patch(`/reminders/${reminderId}`).send({ note: "Relancer lundi" });
    expect(res.status).toBe(200);
    expect(res.body.note).toBe("Relancer lundi");
    expect(res.body.readAt).not.toBeNull();
  });

  /**
   * Idempotence, même raison que pour `updateStatus` : l'historique est trié par `updatedAt`
   * décroissant. Sans ce court-circuit, réenregistrer un formulaire sans rien changer ferait
   * remonter le rappel en tête — et, pire, rallumerait son badge en effaçant `readAt`.
   */
  it("renvoyer les mêmes valeurs ne redate rien et ne rallume pas le badge", async () => {
    const before = required(await reminderOf(coachE, reminderId), "rappel avant no-op");
    const res = await coachE
      .patch(`/reminders/${reminderId}`)
      .send({ dueAt: before.dueAt, note: before.note });

    expect(res.status).toBe(200);
    expect(res.body.updatedAt).toBe(before.updatedAt);
    expect(res.body.readAt).not.toBeNull();
  });

  it("le schéma partagé refuse un corps vide, une échéance sans heure, un statut, un tenant", async () => {
    const patch = (body: object) => coachE.patch(`/reminders/${reminderId}`).send(body);

    // Un corps vide ne demande rien : l'accepter écrirait pour une requête sans intention.
    expect((await patch({})).status).toBe(400);
    expect((await patch({ dueAt: monday })).status).toBe(400);
    expect((await patch({ note: "" })).status).toBe(400);
    // `.strict()` — le statut a SA route, et le tenant est injecté, jamais transmis.
    expect((await patch({ status: "DONE" })).status).toBe(400);
    expect((await patch({ note: "x", coachId: "usr_1" })).status).toBe(400);
    // `readAt` est décidé par l'API : le piloter permettrait d'éteindre son propre badge.
    expect((await patch({ dueAt: inFuture(1), readAt: null })).status).toBe(400);
  });

  /**
   * L'isolation, dans ses deux formes. Un autre coach ne VOIT pas le rappel — le scope ne le lui
   * montre pas, c'est donc un 404 et non un 403 : lui répondre « interdit » confirmerait que cet id
   * existe. Un athlète, lui, prend un 403 du `@Roles` de classe, et surtout PAS le 500 que
   * produirait l'extension Prisma sur un modèle sans scope athlète.
   */
  it("isolation : un autre coach ne peut pas repousser le rappel (404)", async () => {
    const res = await coachF.patch(`/reminders/${reminderId}`).send({ dueAt: inFuture(24) });
    expect(res.status).toBe(404);

    // Et le rappel n'a pas bougé.
    expect(await reminderOf(coachE, reminderId)).toMatchObject({ note: "Relancer lundi" });
  });

  it("l'athlète n'atteint pas la route d'édition (403, jamais 500)", async () => {
    const res = await athleteE1.patch(`/reminders/${reminderId}`).send({ dueAt: inFuture(24) });
    expect(res.status).toBe(403);
  });

  // La route paramétrée ne doit pas avoir avalé `summary`, déclaré au-dessus : c'est la contrainte
  // d'ordre inscrite dans le contrôleur, et elle ne casse que si on réordonne les décorateurs.
  it("l'ajout d'une route paramétrée n'a pas avalé /reminders/summary", async () => {
    const res = await coachE.get("/reminders/summary");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dueCount: expect.any(Number),
      pendingCount: expect.any(Number),
    });
  });
});

/**
 * Génération automatique des rappels et push à l'échéance (#47) — dette R-1.
 *
 * Le tick est appelé **sans session** : c'est un cron externe, pas un utilisateur. Il n'a donc ni
 * acteur courant ni scope tenant — et l'extension Prisma refuse (fail closed) tout modèle sans
 * scope. Ce bloc vérifie que le service ne la contourne pas mais lui **donne un acteur**, coach par
 * coach : ce que génère le tick pour l'un ne doit jamais atterrir chez l'autre.
 *
 * ⚠️ Le tick balaie TOUS les coachs de la base, y compris ceux des blocs précédents. Les assertions
 * portent donc sur ce que voit un coach donné, et sur des DELTAS entre deux ticks — jamais sur un
 * compteur global, qui dépendrait de l'ordre des blocs.
 */
describe("Génération automatique des rappels (#47)", () => {
  // Le secret fixé par `vitest.config.e2e.ts` — une valeur de fixture, pas un environnement.
  const SECRET = "e2e-tick-secret-not-for-production";
  const HEADER = "x-cimavia-tick-secret";

  let coachG: Agent;
  let coachH: Agent;
  let athleteG1: Agent;
  let planId: string;

  const monday = mondayOfCurrentWeek();

  type Rmd = {
    id: string;
    entityType: string;
    entityId: string;
    note: string | null;
    reason: string | null;
    status: string;
    dueAt: string;
  };

  // Le tick n'est PAS authentifié : pas d'agent, une requête nue avec l'en-tête.
  const tick = (secret?: string) => {
    const req = request(baseURL).post("/internal/reminders/tick");
    return secret == null ? req : req.set(HEADER, secret);
  };

  const reminders = async (agent: Agent): Promise<Rmd[]> => (await agent.get("/reminders")).body;
  const reasonsOf = async (agent: Agent): Promise<string[]> =>
    (await reminders(agent))
      .map((r) => r.reason)
      .filter((reason): reason is string => reason != null)
      .sort();

  beforeAll(async () => {
    coachG = await signUp("tick-coach-g@cmv.test", Role.COACH);
    coachH = await signUp("tick-coach-h@cmv.test", Role.COACH);
    athleteG1 = await signUp("tick-athlete-g1@cmv.test", Role.ATHLETE);

    const invitation = await coachG.post("/invitations").send({});
    const accepted = await athleteG1
      .post("/invitations/accept")
      .send({ code: invitation.body.code });

    /**
     * Un cycle d'UNE semaine démarrant ce lundi : sa fin tombe dimanche, donc l'échéance du rappel
     * (fin moins sept jours) est déjà passée. `billAndPublish` l'assortit d'une facture à échéance
     * 2026-01-05, largement dépassée — les deux motifs sont donc exerçables d'un seul cycle.
     */
    const plan = await coachG.post("/plans").send({
      athleteId: accepted.body.athleteId,
      title: "Cycle qui se termine",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    planId = plan.body.id;
    expect((await billAndPublish(coachG, planId)).status).toBe(200);
  });

  /**
   * La garde, montrée EN ÉCHEC avant tout le reste. Aucune distinction entre « en-tête absent » et
   * « en-tête faux » : dire « il manque un en-tête » à qui n'a pas le secret lui apprendrait le nom
   * du champ à forger.
   *
   * Le fail-closed « secret non configuré → 503 » ne peut pas se jouer ici — l'app e2e est montée
   * une seule fois pour toute la suite — il est couvert par `reminder-tick.guard.test.ts`.
   */
  it("refuse un tick sans secret, avec un mauvais secret, ou via Authorization (401)", async () => {
    expect((await tick()).status).toBe(401);
    expect((await tick("")).status).toBe(401);
    expect((await tick("mauvais-secret")).status).toBe(401);
    expect(
      (
        await request(baseURL)
          .post("/internal/reminders/tick")
          .set("authorization", `Bearer ${SECRET}`)
      ).status,
    ).toBe(401);

    // Et surtout : rien n'a été généré au passage.
    expect(await reminders(coachG)).toHaveLength(0);
  });

  /**
   * La génération des deux cas d'exemple. Le rappel auto-généré n'a **pas de note** : c'est toute la
   * contrainte relevée en construisant #44 — une note écrite par l'API serait un libellé rendu puis
   * persisté, ce que le modèle de notification interdit (#48). Il porte un `reason` à la place.
   */
  it("génère un rappel de fin de cycle et un rappel de facture en retard", async () => {
    const res = await tick(SECRET);
    expect(res.status).toBe(200);
    expect(res.body.scannedCoaches).toBeGreaterThan(0);

    expect(await reasonsOf(coachG)).toEqual(["INVOICE_OVERDUE", "PLAN_ENDING"]);

    const planReminder = required(
      (await reminders(coachG)).find((r) => r.reason === "PLAN_ENDING"),
      "rappel de fin de cycle",
    );
    expect(planReminder).toMatchObject({
      entityType: "PLAN",
      entityId: planId,
      note: null, // l'API ne fabrique JAMAIS de note
      status: "PENDING",
    });
  });

  /**
   * L'échéance est dérivée de la DONNÉE, pas de l'heure du tick : la fin du cycle moins sept jours.
   * C'est ce qui rend la granularité du cron externe sans conséquence — un tick en retard d'une
   * heure produit exactement le même rappel.
   */
  it("date le rappel de fin de cycle une semaine avant la fin, pas à l'heure du tick", async () => {
    const planReminder = required(
      (await reminders(coachG)).find((r) => r.reason === "PLAN_ENDING"),
      "rappel de fin de cycle",
    );
    // Cycle d'une semaine depuis lundi → fin le dimanche (lundi + 6), échéance sept jours avant.
    const expected = new Date(`${monday}T00:00:00.000Z`);
    expected.setUTCDate(expected.getUTCDate() + 6 - 7);
    expect(planReminder.dueAt).toBe(expected.toISOString());
  });

  /**
   * L'idempotence n'est pas dans le code mais dans l'index unique + `skipDuplicates`. Sans elle, un
   * tick toutes les cinq minutes recréerait les mêmes rappels indéfiniment — c'est LE mode de panne
   * d'un scheduler, et il ne se voit qu'au second passage.
   */
  it("un second tick ne recrée rien et ne repousse rien", async () => {
    const before = await reminders(coachG);
    const res = await tick(SECRET);

    expect(res.body.createdReminders).toBe(0);
    // `pushedAt` est posé au premier tick : la sélection ne voit plus ces rappels.
    expect(res.body.pushedReminders).toBe(0);
    expect(await reminders(coachG)).toHaveLength(before.length);
  });

  /**
   * L'isolation, sur le chemin qui n'a AUCUN acteur courant. `coachH` n'a ni cycle ni facture : il
   * ne doit rien voir. Si le balayage écrivait hors du contexte CLS de chaque coach, ses rappels
   * atterriraient ici ou nulle part — les deux se verraient.
   */
  it("isolation : les rappels générés n'atterrissent que chez leur coach", async () => {
    expect(await reminders(coachH)).toHaveLength(0);
    expect(await coachH.get("/reminders/summary").then((r) => r.body)).toEqual({
      dueCount: 0,
      pendingCount: 0,
    });
  });

  // Le tick reste une route d'API : un athlète ne doit pas plus la déclencher qu'un visiteur. Il n'a
  // pas le secret, donc 401 — et surtout pas un 500 de l'extension Prisma.
  it("l'athlète ne déclenche pas le tick, même connecté (401)", async () => {
    expect((await athleteG1.post("/internal/reminders/tick")).status).toBe(401);
  });

  /**
   * Le rappel généré remonte dans le centre AVEC un sujet transporté comme CLÉ, pas comme libellé
   * rendu. C'est ce qui empêche « le cycle se termine » de partir figé en français dans une charge
   * utile d'API — la faute que `NOTIFICATION_LABEL_KEY` existe pour interdire.
   */
  it("le rappel généré entre dans le centre avec une clé de sujet, pas un libellé", async () => {
    const entries = (await coachG.get("/me/notifications")).body as {
      type: string;
      subjectLabel: string | null;
      subjectKey: string | null;
    }[];

    const entry = required(
      entries.find((e) => e.subjectKey === "reminder.reason.planEnding"),
      "entrée du rappel généré",
    );
    expect(entry.type).toBe("REMINDER_DUE");
    expect(entry.subjectLabel).toBeNull();
  });

  /**
   * Un rappel généré puis TRAITÉ n'est jamais régénéré, même si la condition persiste — la facture
   * reste impayée. C'est la conséquence assumée de l'index unique : le coach a tranché, on ne le
   * relance pas. Sans ce test, quelqu'un « corrigerait » un jour l'index en croyant à un oubli.
   */
  it("ne régénère pas un rappel que le coach a traité", async () => {
    const invoiceReminder = required(
      (await reminders(coachG)).find((r) => r.reason === "INVOICE_OVERDUE"),
      "rappel de facture en retard",
    );
    expect(
      (await coachG.patch(`/reminders/${invoiceReminder.id}/status`).send({ status: "DISMISSED" }))
        .status,
    ).toBe(200);

    const res = await tick(SECRET);
    expect(res.body.createdReminders).toBe(0);

    const after = (await reminders(coachG)).filter((r) => r.reason === "INVOICE_OVERDUE");
    expect(after).toHaveLength(1);
    expect(required(after[0], "rappel traité").status).toBe("DISMISSED");
  });
});

/**
 * Copier/coller une semaine (#4).
 *
 * Ce que la copie emporte est ce que le COACH a composé ; ce qu'elle laisse appartient à l'athlète
 * ou à l'exécution. Les dates ne sont pas recopiées mais RECALCULÉES depuis le lundi de la semaine
 * cible — c'est la seule façon de rester dans la plage de sa semaine en changeant de cycle.
 */
describe("Copie d'une semaine de planification (#4)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let athleteA2: Agent;
  let a1Id: string;
  let a2Id: string;

  let templateId: string;
  let exerciseId: string;
  let draftPlanId: string;
  let w1Id: string;
  let w2Id: string;
  let w3Id: string;
  let w4Id: string;
  // Cycle d'un AUTRE athlète, démarrant 8 semaines plus tard : la copie y change d'athlète ET de
  // référentiel de dates.
  let otherPlanId: string;
  let otherWeekId: string;
  // Cycle diffusé de A1 : sert de source autorisée (lecture seule) et de cible refusée.
  let livePlanId: string;
  let liveWeekId: string;
  let liveSessionId: string;
  let foreignWeekId: string;

  const monday = mondayOfCurrentWeek();
  const otherMonday = shiftIsoDate(monday, 56) as string;
  const day = (offset: number) => shiftIsoDate(monday, offset) as string;

  async function link(coach: Agent, athlete: Agent): Promise<string> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    expect(accepted.status).toBe(201);
    return accepted.body.athleteId;
  }

  // Le contenu d'une semaine, tel que le builder le lit.
  async function weekOf(coach: Agent, planId: string, weekId: string) {
    const plan = await coach.get(`/plans/${planId}`);
    return plan.body.weeks.find((w: { id: string }) => w.id === weekId);
  }

  async function paste(coach: Agent, targetWeekId: string, sourcePlanWeekId: string) {
    return coach.post(`/plan-weeks/${targetWeekId}/copy-from`).send({ sourcePlanWeekId });
  }

  beforeAll(async () => {
    coachA = await signUp("copy-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("copy-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("copy-athlete-a1@cmv.test", Role.ATHLETE);
    athleteA2 = await signUp("copy-athlete-a2@cmv.test", Role.ATHLETE);
    const athleteB1 = await signUp("copy-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    a2Id = await link(coachA, athleteA2);
    const b1Id = await link(coachB, athleteB1);

    // Bibliothèque de A : un exercice documenté, composé dans une séance modèle.
    const exercise = await coachA
      .post("/exercises")
      .send({ title: "Suspensions", description: "Réglette 20 mm", tags: ["grimpe"] });
    exerciseId = exercise.body.id;
    await coachA
      .post(`/exercises/${exerciseId}/documents`)
      .send({ type: "LINK", url: "https://youtu.be/hangboard" });

    const template = await coachA.post("/sessions").send({
      title: "Doigts",
      notes: "Échauffement long.",
      exercises: [{ exerciseId, note: "6×10 s" }],
    });
    templateId = template.body.id;

    // Cycle brouillon de A1 : 4 semaines.
    const draft = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle copie",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }, { type: "TRAINING" }, { type: "DELOAD" }],
    });
    draftPlanId = draft.body.id;
    [w1Id, w2Id, w3Id, w4Id] = draft.body.weeks.map((w: { id: string }) => w.id);

    // Semaine 1 : deux séances le même lundi (positions 0 et 1) + une le mercredi.
    await coachA
      .post(`/plan-weeks/${w1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: day(0) });
    await coachA
      .post(`/plan-weeks/${w1Id}/sessions`)
      .send({ title: "Renfo court", scheduledDate: day(0) });
    await coachA
      .post(`/plan-weeks/${w1Id}/sessions`)
      .send({ title: "Voie", scheduledDate: day(2) });

    // Semaine 3 : déjà occupée — elle devra être REMPLACÉE, pas fusionnée.
    await coachA
      .post(`/plan-weeks/${w3Id}/sessions`)
      .send({ title: "À écraser", scheduledDate: day(15) });

    // Cycle d'un autre athlète, 8 semaines plus tard.
    const other = await coachA.post("/plans").send({
      athleteId: a2Id,
      title: "Cycle de A2",
      startDate: otherMonday,
      weeks: [{ type: "TRAINING" }],
    });
    otherPlanId = other.body.id;
    otherWeekId = other.body.weeks[0].id;

    // Cycle diffusé de A1, avec une séance que l'athlète débriefera (→ DONE).
    const live = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle diffusé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    livePlanId = live.body.id;
    liveWeekId = live.body.weeks[0].id;
    const liveSession = await coachA
      .post(`/plan-weeks/${liveWeekId}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: day(1) });
    liveSessionId = liveSession.body.id;
    expect((await billAndPublish(coachA, livePlanId)).status).toBe(200);

    await athleteA1
      .put(`/me/scheduled-sessions/${liveSessionId}/feedback`)
      .send({ content: "Bonnes sensations." });

    // Une semaine chez le coach B, pour les contrôles d'appartenance.
    const foreign = await coachB.post("/plans").send({
      athleteId: b1Id,
      title: "Chez B",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    foreignWeekId = foreign.body.weeks[0].id;
  });

  it("colle le contenu d'une semaine dans une autre, en REMPLAÇANT ce qui s'y trouvait", async () => {
    const res = await paste(coachA, w3Id, w1Id);
    expect(res.status).toBe(201);

    const week3 = res.body.weeks.find((w: { id: string }) => w.id === w3Id);
    expect(week3.sessions).toHaveLength(3);
    // Fusion impossible (unicité semaine/date/position) : la séance qui occupait la cible a disparu.
    expect(week3.sessions.some((s: { title: string }) => s.title === "À écraser")).toBe(false);

    // Deux semaines plus loin : le lundi reste un lundi, le mercredi un mercredi.
    const byTitle = (title: string) =>
      week3.sessions.find((s: { title: string }) => s.title === title);
    expect(byTitle("Doigts").scheduledDate).toBe(day(14));
    expect(byTitle("Renfo court").scheduledDate).toBe(day(14));
    expect(byTitle("Voie").scheduledDate).toBe(day(16));

    // L'ordre DANS la journée est une intention du coach : il est recopié tel quel.
    expect(byTitle("Doigts").position).toBe(0);
    expect(byTitle("Renfo court").position).toBe(1);
    expect(byTitle("Voie").position).toBe(0);

    // La semaine source est intacte : c'est une copie, pas un déplacement.
    expect((await weekOf(coachA, draftPlanId, w1Id)).sessions).toHaveLength(3);
  });

  it("emporte la composition et les documents, en lignes NEUVES", async () => {
    const week3 = await weekOf(coachA, draftPlanId, w3Id);
    const copyId = week3.sessions.find((s: { title: string }) => s.title === "Doigts").id;

    const detail = await coachA.get(`/scheduled-sessions/${copyId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.notes).toBe("Échauffement long.");
    expect(detail.body.exercises).toHaveLength(1);
    expect(detail.body.exercises[0]).toMatchObject({
      sourceExerciseId: exerciseId,
      title: "Suspensions",
      note: "6×10 s",
      position: 0,
    });
    // Le document suit la copie — même lien, ligne distincte de celle de la séance source.
    expect(detail.body.exercises[0].documents).toHaveLength(1);
    expect(detail.body.exercises[0].documents[0].url).toBe("https://youtu.be/hangboard");

    const source = await weekOf(coachA, draftPlanId, w1Id);
    const sourceId = source.sessions.find((s: { title: string }) => s.title === "Doigts").id;
    expect(copyId).not.toBe(sourceId);
    const sourceDetail = await coachA.get(`/scheduled-sessions/${sourceId}`);
    expect(sourceDetail.body.exercises[0].id).not.toBe(detail.body.exercises[0].id);
  });

  it("emporte le type et la note de la semaine, pas seulement ses séances", async () => {
    await coachA.patch(`/plan-weeks/${w1Id}`).send({ type: "DELOAD", note: "volume -40 %" });

    const res = await paste(coachA, w4Id, w1Id);
    expect(res.status).toBe(201);

    const week4 = res.body.weeks.find((w: { id: string }) => w.id === w4Id);
    expect(week4.type).toBe("DELOAD");
    expect(week4.note).toBe("volume -40 %");

    await coachA.patch(`/plan-weeks/${w1Id}`).send({ type: "TRAINING", note: null });
  });

  it("une séance faite arrive PLANNED, et son débrief ne la suit pas", async () => {
    // La source est le cycle DIFFUSÉ : y lire ne le mute pas, et c'est le cas d'usage réel
    // (« reprendre le bloc du mois dernier »).
    const res = await paste(coachA, w2Id, liveWeekId);
    expect(res.status).toBe(201);

    const week2 = res.body.weeks.find((w: { id: string }) => w.id === w2Id);
    expect(week2.sessions).toHaveLength(1);
    // Le statut décrit l'EXÉCUTION de l'athlète, pas la composition du coach.
    expect(week2.sessions[0].status).toBe("PLANNED");
    // Une séance non débriefée rend `null`, pas un 404 (règle nullable) : c'est l'absence d'id
    // qui dit que le débrief n'a pas suivi la copie.
    const copyFeedback = await coachA.get(`/scheduled-sessions/${week2.sessions[0].id}/feedback`);
    expect(copyFeedback.status).toBe(200);
    expect(copyFeedback.body?.id).toBeUndefined();

    // La séance source, elle, garde son statut et son débrief.
    const live = await weekOf(coachA, livePlanId, liveWeekId);
    expect(live.sessions[0].status).toBe("DONE");
    const sourceFeedback = await coachA.get(`/scheduled-sessions/${liveSessionId}/feedback`);
    expect(sourceFeedback.body.content).toBe("Bonnes sensations.");
  });

  it("colle vers le cycle d'un AUTRE athlète : les séances atterrissent chez lui seul", async () => {
    const res = await paste(coachA, otherWeekId, w1Id);
    expect(res.status).toBe(201);

    const week = res.body.weeks.find((w: { id: string }) => w.id === otherWeekId);
    expect(week.sessions).toHaveLength(3);
    // Référentiel de dates de la CIBLE : 8 semaines plus loin, le lundi reste un lundi.
    expect(week.sessions.map((s: { scheduledDate: string }) => s.scheduledDate)).toContain(
      shiftIsoDate(otherMonday, 0),
    );
    expect(week.sessions.map((s: { scheduledDate: string }) => s.scheduledDate)).toContain(
      shiftIsoDate(otherMonday, 2),
    );

    const copyId = week.sessions[0].id;
    expect((await billAndPublish(coachA, otherPlanId)).status).toBe(200);

    // La preuve que l'athleteId dénormalisé est celui de la CIBLE : A2 lit la séance, A1 non.
    expect((await athleteA2.get(`/me/scheduled-sessions/${copyId}`)).status).toBe(200);
    expect((await athleteA1.get(`/me/scheduled-sessions/${copyId}`)).status).toBe(404);
  });

  it("refuse de coller dans un cycle DIFFUSÉ (409), sans rien y écrire", async () => {
    const before = await weekOf(coachA, livePlanId, liveWeekId);

    const res = await paste(coachA, liveWeekId, w1Id);
    expect(res.status).toBe(409);

    const after = await weekOf(coachA, livePlanId, liveWeekId);
    expect(after.sessions).toHaveLength(before.sessions.length);
    expect(after.sessions[0].id).toBe(before.sessions[0].id);
  });

  it("coller dans un brouillon n'émet AUCUNE notification à l'athlète", async () => {
    const before = (await athleteA1.get("/me/notifications")).body.length;

    expect((await paste(coachA, w3Id, w1Id)).status).toBe(201);

    expect((await athleteA1.get("/me/notifications")).body.length).toBe(before);
  });

  it("refuse une semaine source inconnue par un 400 — jamais un 404 qui confirmerait son id", async () => {
    // La semaine existe, mais chez un autre coach : indiscernable d'un id inventé.
    const foreign = await paste(coachA, w2Id, foreignWeekId);
    expect(foreign.status).toBe(400);

    const unknown = await paste(coachA, w2Id, "pw_inexistante");
    expect(unknown.status).toBe(400);
    expect(unknown.status).toBe(foreign.status);
  });

  it("refuse une semaine cible qui n'est pas la sienne (404)", async () => {
    expect((await paste(coachA, foreignWeekId, w1Id)).status).toBe(404);
  });

  it("refuse la copie d'une semaine sur elle-même", async () => {
    // Ce n'est pas un no-op : détruire puis recréer donnerait de nouveaux id aux séances.
    expect((await paste(coachA, w1Id, w1Id)).status).toBe(400);
  });

  it("refuse toute date proposée par le client (le schéma est strict)", async () => {
    const res = await coachA
      .post(`/plan-weeks/${w2Id}/copy-from`)
      .send({ sourcePlanWeekId: w1Id, scheduledDate: day(0) });
    expect(res.status).toBe(400);
  });

  it("la route reste fermée à l'athlète", async () => {
    expect((await athleteA1.post(`/plan-weeks/${w3Id}/copy-from`).send({})).status).toBe(403);
  });
});

/**
 * Parité multi-plateforme (#36) — les MURS que les clients ne doivent jamais toucher.
 *
 * Rien de nouveau côté API : cette épic n'a ajouté aucun endpoint. Ce qu'elle a changé, c'est que
 * les DEUX rôles atteignent désormais les deux plateformes — et donc que chaque client peut, par
 * un lien profond, une notification ou un onglet mal filtré, appeler une route qui n'est pas la
 * sienne. Ces cas étaient jusqu'ici impossibles par construction (un rôle = une plateforme), donc
 * non couverts.
 *
 * Ce bloc fige où sont les murs. Il ne teste pas l'UI — aucun e2e ne le peut — mais il garantit que
 * les gardes sur lesquelles l'UI s'appuie existent bien, et qu'elles répondent 403 plutôt que de
 * servir la donnée d'un autre rôle.
 */
describe("Parité multi-plateforme : les surfaces restent fermées à l'autre rôle (#36)", () => {
  let coach: Agent;
  let athlete: Agent;
  let athleteId: string;

  beforeAll(async () => {
    coach = await signUp("coach-parity@cmv.test", Role.COACH);
    athlete = await signUp("athlete-parity@cmv.test", Role.ATHLETE);

    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    athleteId = accepted.body.athleteId;
  });

  /**
   * `GET /me/plan` est `@Roles([ATHLETE])`. C'est le mur sur lequel le mobile s'est cassé : trois
   * redirections envoyaient tout le monde sur `/planning`, et un coach y prenait un 403 dès la
   * connexion.
   */
  it("refuse au coach les surfaces /me de l'athlète", async () => {
    expect((await coach.get("/me/plan")).status).toBe(403);
    expect((await coach.get("/me/coach")).status).toBe(403);
  });

  /**
   * Le débrief est ÉCRIT par l'athlète et LU par le coach, sur deux contrôleurs distincts. Un
   * client qui se trompe de surface prend un 403 — pas une liste vide, qui laisserait croire qu'il
   * n'y a rien à lire.
   */
  it("sépare l'écriture du débrief (athlète) de sa lecture (coach)", async () => {
    expect((await coach.get("/me/scheduled-sessions/ss_inexistante/feedback")).status).toBe(403);
    expect((await athlete.get("/feedbacks")).status).toBe(403);
  });

  // La bibliothèque et le builder restent web-only ET coach-only (décision explicite de #20) :
  // l'athlète n'a aucun scope dessus, il ne voit que les copies que la planification lui expose.
  it("garde la bibliothèque et les cycles fermés à l'athlète", async () => {
    expect((await athlete.get("/exercises")).status).toBe(403);
    expect((await athlete.get("/sessions")).status).toBe(403);
    expect((await athlete.get("/plans")).status).toBe(403);
    expect((await athlete.get("/athletes")).status).toBe(403);
  });

  /**
   * `Reminder` est la SEULE entité scopée `coachId` seul : un athlète qui l'atteint est refusé par
   * une **erreur** (fail closed), pas par un 403. C'est pourquoi le contrôleur porte `@Roles` — il
   * est la garde qui transforme ce refus en réponse propre. Sans lui, l'écran de facturation web
   * ouvert à l'athlète (#27) aurait fait un 500 par son bouton « Programmer un rappel ».
   */
  it("refuse les rappels à l'athlète par un 403, jamais par une erreur", async () => {
    const list = await athlete.get("/reminders");
    expect(list.status).toBe(403);
    expect((await athlete.get("/reminders/summary")).status).toBe(403);
    expect((await athlete.post("/reminders").send({})).status).toBe(403);
  });

  /**
   * La facture est LUE par les deux (une seule route, scopée par le tenant) mais son statut n'est
   * piloté que par le coach. C'est ce qui permet un seul écran par plateforme, branché sur un
   * booléen plutôt que dupliqué.
   */
  it("ouvre la lecture des factures aux deux rôles, le statut au coach seul", async () => {
    expect((await coach.get("/invoices")).status).toBe(200);
    expect((await athlete.get("/invoices")).status).toBe(200);
    expect(
      (await athlete.patch("/invoices/inv_inexistante/status").send({ status: "PAID" })).status,
    ).toBe(403);
  });

  /**
   * La messagerie est le seul domaine ouvert aux deux rôles de bout en bout. L'ouverture d'un fil
   * se distingue par le seul CORPS : `athleteId` présent côté coach, absent côté athlète — et un
   * athlète qui tenterait de cibler quelqu'un d'autre ne doit pas y arriver.
   */
  it("ouvre la messagerie aux deux rôles, chacun de son côté", async () => {
    const opened = await coach.post("/conversations").send({ athleteId });
    expect(opened.status).toBe(201);
    expect(opened.body.counterpartId).toBe(athleteId);

    const mine = await athlete.post("/conversations").send({});
    expect(mine.status).toBe(201);
    expect(mine.body.id).toBe(opened.body.id);
  });

  /**
   * Côté athlète, `athleteId` est **ignoré** — pas refusé : `resolvePair` lit sa relation scopée et
   * pose `athleteId: actor.userId`. Un athlète qui viserait quelqu'un d'autre récupère donc SON
   * propre fil, pas celui d'un tiers. C'est le comportement voulu, et ce test le fige : le jour où
   * quelqu'un « corrigerait » le service pour honorer le champ, il ouvrirait une fuite entre
   * tenants.
   */
  it("ignore un athleteId ciblé par un athlète, au lieu de l'honorer", async () => {
    const other = await signUp("athlete-parity-2@cmv.test", Role.ATHLETE);
    const otherInvitation = await coach.post("/invitations").send({});
    const otherAccepted = await other
      .post("/invitations/accept")
      .send({ code: otherInvitation.body.code });

    const hijack = await athlete
      .post("/conversations")
      .send({ athleteId: otherAccepted.body.athleteId });
    expect(hijack.status).toBe(201);
    // Le fil rendu est celui de l'athlète courant avec SON coach, jamais celui du tiers visé.
    expect(hijack.body.counterpartId).not.toBe(otherAccepted.body.athleteId);
    expect(hijack.body.counterpartId).toBe(otherAccepted.body.coachId);
  });
});

describe("Double capacité : le scope suit le titre auquel on lit (#10)", () => {
  let coachA: Agent;
  let dual: Agent;
  let coachB: Agent;
  let athleteB: Agent;
  let dualId: string;

  const monday = mondayOfCurrentWeek();

  async function link(coach: Agent, athlete: Agent): Promise<string> {
    const invitation = await coach.post("/invitations").send({});
    const accepted = await athlete.post("/invitations/accept").send({ code: invitation.body.code });
    expect(accepted.status).toBe(201);
    return accepted.body.athleteId;
  }

  async function issueInvoice(coach: Agent, athleteId: string): Promise<void> {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle facturé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);
  }

  beforeAll(async () => {
    // `dual` coche les DEUX cases : depuis #12, c'est ce que le signup permet.
    coachA = await signUp("dual-coach-a@cmv.test", Role.COACH);
    dual = await signUpWith("dual-account@cmv.test", { isCoach: true, isAthlete: true });
    coachB = await signUp("dual-coach-b@cmv.test", Role.COACH);
    athleteB = await signUp("dual-athlete-b@cmv.test", Role.ATHLETE);

    dualId = await link(coachA, dual);

    // Une facture REÇUE par `dual` (émise par coachA), et une facture d'un tenant étranger.
    await issueInvoice(coachA, dualId);
    await issueInvoice(coachB, await link(coachB, athleteB));
  });

  /**
   * Un compte sans AUCUNE capacité ne pourrait rien faire, et le fail closed de `capabilitiesOf`
   * le laisserait devant une application vide sans lui dire pourquoi. Le refus est à la création,
   * pas à chaque écran.
   */
  it("refuse une inscription sans aucune capacité", async () => {
    const res = await request.agent(baseURL).post("/api/auth/sign-up/email").send({
      name: "vide@cmv.test",
      email: "vide@cmv.test",
      password: PASSWORD,
      isCoach: false,
      isAthlete: false,
    });
    expect(res.status).toBe(400);
  });

  /**
   * `role` est DÉDUIT et non reçu (#12) : coach l'emporte quand les deux cases sont cochées.
   * C'est le persona — l'univers d'atterrissage — pas un droit.
   */
  it("déduit le persona coach d'un compte qui coche les deux", async () => {
    const session = await dual.get("/api/auth/get-session");
    expect(session.body.user.role).toBe(Role.COACH);
    expect(session.body.user.isCoach).toBe(true);
    expect(session.body.user.isAthlete).toBe(true);
  });

  /**
   * Le cas que le rôle exclusif ne savait pas trancher : `GET /invoices` n'a pas de paramètre, et
   * pour ce compte les deux réponses existent. Répondre « les émises » par convention laisserait
   * croire qu'on voit tout — c'est le fallback que la règle nullable interdit.
   */
  it("exige de préciser à quel titre on lit (400)", async () => {
    const res = await dual.get("/invoices");
    expect(res.status).toBe(400);
  });

  it("rend les factures REÇUES en tant qu'athlète", async () => {
    const res = await dual.get("/invoices?as=athlete");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].athleteId).toBe(dualId);
  });

  /**
   * La même route, le même compte, l'autre titre : la liste est VIDE parce que `dual` n'a rien
   * émis. C'est ce qui prouve que le scope a changé de colonne (`athleteId` → `coachId`), et pas
   * seulement que la garde a laissé passer.
   */
  it("rend les factures ÉMISES en tant que coach — vides ici", async () => {
    const res = await dual.get("/invoices?as=coach");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  // Sans ce refus, un compte demanderait le titre qu'il n'a pas : inoffensif tant qu'il n'a rien
  // de ce côté, jusqu'au jour où il en aurait.
  it("refuse un titre que le compte ne porte pas (403)", async () => {
    expect((await coachA.get("/invoices?as=athlete")).status).toBe(403);
  });

  it("refuse un titre qui n'existe pas (400)", async () => {
    expect((await dual.get("/invoices?as=admin")).status).toBe(400);
  });

  // Un compte mono-capacité n'a rien à préciser : sa capacité est la seule réponse possible. C'est
  // ce qui fait qu'aucun client n'a eu à changer.
  it("laisse un compte mono-capacité lire sans rien préciser", async () => {
    const res = await athleteB.get("/invoices");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  /**
   * Le centre de notifications, lui, n'a PAS de titre : il montre ce qui est adressé au compte.
   * Lui en faire exiger un aurait obligé ce compte à choisir à quel titre il consulte ses
   * notifications, et à n'en voir que la moitié — d'où l'absence de 400 ici, contrairement aux
   * factures juste au-dessus. Le contraste entre ces deux tests EST la règle.
   */
  it("rend le centre de notifications sans rien préciser", async () => {
    expect((await dual.get("/me/notifications")).status).toBe(200);
    expect((await dual.get("/me/notifications/unread-count")).status).toBe(200);
  });

  // Règle dure n°1 : cumuler deux capacités n'ouvre AUCUNE porte vers un autre tenant.
  it("ne franchit la frontière de tenant dans aucun des deux titres", async () => {
    const foreign = await coachB.get("/invoices?as=coach");
    const foreignId = required(foreign.body[0], "facture du tenant B").id;

    expect((await dual.get(`/invoices/${foreignId}?as=athlete`)).status).toBe(404);
    expect((await dual.get(`/invoices/${foreignId}?as=coach`)).status).toBe(404);
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
      const invitation = await coach.post("/invitations").send({});
      const accepted = await athlete
        .post("/invitations/accept")
        .send({ code: invitation.body.code });
      expect(accepted.status).toBe(201);
      ids.push(accepted.body.coachId);
      if (i + 2 === depth) ids.push(accepted.body.athleteId);
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

    const invitation = await c.post("/invitations").send({});
    const res = await a.post("/invitations/accept").send({ code: invitation.body.code });

    expect(res.status).toBe(409);
  });

  // La boucle la plus courte : B coache A alors que A coache déjà B.
  it("refuse la boucle immédiate entre deux comptes", async () => {
    const { agents } = await chain("cycle-pair", 2);
    const b = required(agents[1], "maillon B");
    const a = required(agents[0], "maillon A");

    const invitation = await b.post("/invitations").send({});
    const res = await a.post("/invitations/accept").send({ code: invitation.body.code });

    expect(res.status).toBe(409);
  });

  /**
   * Anti-self. Inatteignable avant #9/#10 : accepter exige la capacité athlète, qu'un coach
   * n'avait pas. Un compte qui cumule peut désormais présenter son propre code.
   */
  it("refuse à un compte à double capacité d'accepter sa propre invitation", async () => {
    const self = await signUpWith("cycle-self@cmv.test", { isCoach: true, isAthlete: true });

    const invitation = await self.post("/invitations").send({});
    const res = await self.post("/invitations/accept").send({ code: invitation.body.code });

    expect(res.status).toBe(409);
  });

  /**
   * Deux chaînes distinctes ne se gênent pas : le refus porte sur la BOUCLE, pas sur le fait
   * d'être déjà coaché ailleurs — ça, c'est l'unicité `athleteId`, qui a son propre test.
   */
  it("laisse un compte déjà coach devenir l'athlète d'une autre chaîne", async () => {
    const { agents } = await chain("cycle-join", 2);
    const outsider = await signUp("cycle-outsider@cmv.test", Role.COACH);
    const a = required(agents[0], "maillon A");

    const invitation = await outsider.post("/invitations").send({});
    const res = await a.post("/invitations/accept").send({ code: invitation.body.code });

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
    const invitation = await coach.post("/invitations").send({});
    expect(
      (await athlete.post("/invitations/accept").send({ code: invitation.body.code })).status,
    ).toBe(201);

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
    const invitation = await coach.post("/invitations").send({});
    expect(
      (await linked.post("/invitations/accept").send({ code: invitation.body.code })).status,
    ).toBe(201);

    const res = await linked.patch("/me/capabilities").send({ isCoach: true, isAthlete: false });
    expect(res.status).toBe(409);
    expect((await capabilitiesOfSession(linked)).isAthlete).toBe(true);
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
});

describe("Auto-coaching : écrire et diffuser un cycle pour soi (#14)", () => {
  let solo: Agent;
  let soloId: string;
  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    solo = await signUpWith("solo@cmv.test", { isCoach: true, isAthlete: true });
    const list = await solo.get("/athletes");
    soloId = required(list.body[0], "entrée self dans /athletes").athleteId;
  });

  /**
   * L'entrée SYNTHÉTIQUE : il n'existe aucune ligne `CoachAthlete` (le CHECK l'interdit depuis
   * #11), mais le compte doit pouvoir se désigner comme destinataire. C'est ce qui permet au
   * builder web de rester inchangé — il lit déjà cette route.
   */
  it("se voit lui-même en tête de sa liste d'athlètes", async () => {
    const res = await solo.get("/athletes");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: "self", isSelf: true, athleteId: soloId });
    expect(res.body[0].coachId).toBe(soloId);
  });

  // Un coach PUR n'est pas son propre athlète : lui ouvrir cette porte lui ferait écrire des
  // cycles qu'il ne pourrait jamais lire, la lecture passant par les routes athlète.
  it("ne se voit pas quand il n'a que la capacité coach", async () => {
    const coachOnly = await signUpWith("solo-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    expect((await coachOnly.get("/athletes")).body).toHaveLength(0);
  });

  it("refuse un cycle pour soi à un coach sans capacité athlète", async () => {
    const coachOnly = await signUpWith("solo-coach-2@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const session = await coachOnly.get("/api/auth/get-session");
    const res = await coachOnly.post("/plans").send({
      athleteId: session.body.user.id,
      title: "Pour moi",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(res.status).toBe(400);
  });

  /**
   * Le parcours complet, et le point de l'issue : la state machine `DRAFT → PUBLISHED` ne change
   * PAS. C'est elle qui donne au cycle ses `ScheduledSession` lisibles et débriefables.
   */
  it("écrit puis diffuse un cycle pour soi, SANS facture ni notification", async () => {
    const plan = await solo.post("/plans").send({
      athleteId: soloId,
      title: "Ma prépa",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);

    // Le gating de facturation est levé : diffuser ne demande AUCUN terme saisi.
    const published = await solo.post(`/plans/${plan.body.id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe("PUBLISHED");

    // Ni facture émise, ni notification : s'annoncer à soi-même ce qu'on vient de faire.
    expect((await solo.get("/invoices?as=coach")).body).toHaveLength(0);
    expect((await solo.get("/invoices?as=athlete")).body).toHaveLength(0);
    expect((await solo.get("/me/notifications")).body).toHaveLength(0);
  });

  // Le cycle diffusé se lit par les routes ATHLÈTE, comme n'importe quel autre : c'est tout
  // l'intérêt d'avoir gardé la state machine.
  it("relit son propre cycle par les routes athlète", async () => {
    const mine = await solo.get("/me/plan");
    expect(mine.status).toBe(200);
    expect(mine.body?.title).toBe("Ma prépa");
  });

  // On ne se facture pas soi-même : un refus explicite, plutôt qu'un brouillon saisi pour rien.
  it("refuse de facturer un cycle écrit pour soi (409)", async () => {
    const plan = await solo.post("/plans").send({
      athleteId: soloId,
      title: "Cycle non facturable",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const res = await solo
      .put(`/plans/${plan.body.id}/billing`)
      .send({ amountCents: 5000, dueDate: monday });
    expect(res.status).toBe(409);
  });

  /**
   * Le parcours complet en solo : composer, diffuser, débriefer, RELIRE son débrief côté coach.
   * C'est le bout qui ferme la boucle — un débrief qu'on écrit et qu'on ne retrouve jamais rend
   * l'auto-coaching inutile.
   */
  it("retrouve côté coach le débrief qu'il a écrit côté athlète", async () => {
    const exercise = await solo.post("/exercises").send({ title: "Suspension" });
    expect(exercise.status).toBe(201);
    const template = await solo.post("/sessions").send({
      title: "Séance solo",
      exercises: [{ exerciseId: exercise.body.id }],
    });
    expect(template.status).toBe(201);

    const plan = await solo.post("/plans").send({
      athleteId: soloId,
      title: "Cycle à débriefer",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const weekId = required(plan.body.weeks[0], "semaine du cycle solo").id;
    const scheduled = await solo
      .post(`/plan-weeks/${weekId}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: monday });
    expect(scheduled.status).toBe(201);
    expect((await solo.post(`/plans/${plan.body.id}/publish`)).status).toBe(200);

    // Écrit en tant qu'ATHLÈTE…
    const written = await solo
      .put(`/me/scheduled-sessions/${scheduled.body.id}/feedback`)
      .send({ content: "Bonnes sensations" });
    expect(written.status).toBe(200);

    // … et relu en tant que COACH, sur la même session.
    const received = await solo.get("/feedbacks");
    expect(received.status).toBe(200);
    expect(received.body).toHaveLength(1);
    expect(received.body[0]).toMatchObject({
      athleteId: soloId,
      content: "Bonnes sensations",
    });

    // Et AUCUNE notification au passage : ni la diffusion, ni le débrief ne s'annoncent à leur
    // propre auteur. C'est la règle posée dans `NotificationService`, qui vaut pour tout émetteur.
    expect((await solo.get("/me/notifications")).body).toHaveLength(0);
    expect((await solo.get("/me/notifications/unread-count")).body.count).toBe(0);
  });

  // Déjà fermée avant #14 (`resolvePair` exige une relation des deux côtés) — ce test fige le
  // comportement plutôt que de le supposer acquis.
  it("n'ouvre pas de fil de messagerie avec soi-même", async () => {
    expect((await solo.post("/conversations?as=coach").send({ athleteId: soloId })).status).toBe(
      400,
    );
    expect((await solo.post("/conversations?as=athlete").send({})).status).toBe(400);
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
    const toDual = await myCoach.post("/invitations").send({});
    const dualId = (await dual.post("/invitations/accept").send({ code: toDual.body.code })).body
      .athleteId;
    // … et le coach de `myAthlete`.
    const toAthlete = await dual.post("/invitations").send({});
    const athleteId = (
      await myAthlete.post("/invitations/accept").send({ code: toAthlete.body.code })
    ).body.athleteId;

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
    // Reçu en athlète : cycle diffusé + facture émise. Reçu en coach : le débrief.
    expect(unread.body.athlete).toBe(2);
    expect(unread.body.coach).toBe(1);
    expect(unread.body.count).toBe(3);
  });

  // Un compte mono-capacité voit tout d'un seul côté : la ventilation ne lui coûte rien et ne
  // change pas son total, que la cloche lit toujours.
  it("range tout du seul côté d'un compte mono-capacité", async () => {
    const coach = await signUpWith("vent-solo-coach@cmv.test", {
      isCoach: true,
      isAthlete: false,
    });
    const athlete = await signUp("vent-solo-athlete@cmv.test", Role.ATHLETE);
    const invitation = await coach.post("/invitations").send({});
    const id = (await athlete.post("/invitations/accept").send({ code: invitation.body.code })).body
      .athleteId;

    const plan = await coach.post("/plans").send({
      athleteId: id,
      title: "Cycle simple",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);

    const unread = await athlete.get("/me/notifications/unread-count");
    expect(unread.body).toMatchObject({ coach: 0, athlete: 2, count: 2 });
  });
});

/**
 * Règle dure n°1 face au modèle de capacités (#18) : **cumuler deux capacités n'ouvre aucune
 * porte**. Les suites précédentes vérifient que chaque fonctionnalité marche en double casquette ;
 * celle-ci vérifie qu'elle ne marche pas TROP.
 *
 * La question qui la motive : un compte qui est à la fois coach de quelqu'un et athlète de
 * quelqu'un d'autre traverse deux tenants. Rien ne doit fuir de l'un vers l'autre, ni d'un tiers
 * vers lui.
 */
describe("Isolation multi-capacité (#18)", () => {
  let dual: Agent;
  let dualId: string;
  let hisCoach: Agent;
  let hisAthlete: Agent;
  let hisAthleteId: string;
  let stranger: Agent;
  let strangerAthlete: Agent;
  let strangerExerciseId: string;
  let strangerPlanId: string;

  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    dual = await signUpWith("iso-dual@cmv.test", { isCoach: true, isAthlete: true });
    hisCoach = await signUpWith("iso-his-coach@cmv.test", { isCoach: true, isAthlete: false });
    hisAthlete = await signUp("iso-his-athlete@cmv.test", Role.ATHLETE);
    stranger = await signUpWith("iso-stranger@cmv.test", { isCoach: true, isAthlete: false });
    strangerAthlete = await signUp("iso-stranger-athlete@cmv.test", Role.ATHLETE);

    // `dual` est coaché par `hisCoach`, et coache `hisAthlete`.
    const toDual = await hisCoach.post("/invitations").send({});
    dualId = (await dual.post("/invitations/accept").send({ code: toDual.body.code })).body
      .athleteId;
    const toHisAthlete = await dual.post("/invitations").send({});
    hisAthleteId = (
      await hisAthlete.post("/invitations/accept").send({ code: toHisAthlete.body.code })
    ).body.athleteId;

    // Un tenant étranger, complet : sa bibliothèque, son athlète, son cycle diffusé.
    const toStrangerAthlete = await stranger.post("/invitations").send({});
    const strangerAthleteId = (
      await strangerAthlete.post("/invitations/accept").send({ code: toStrangerAthlete.body.code })
    ).body.athleteId;
    strangerExerciseId = (await stranger.post("/exercises").send({ title: "Secret" })).body.id;
    const plan = await stranger.post("/plans").send({
      athleteId: strangerAthleteId,
      title: "Cycle étranger",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    strangerPlanId = plan.body.id;
    expect((await billAndPublish(stranger, strangerPlanId)).status).toBe(200);
  });

  /**
   * Le cas propre au modèle : `dual` a DEUX titres, donc deux colonnes de scope. Ni l'un ni
   * l'autre ne doit atteindre un tenant qui n'est pas le sien — un scope qui bascule ne doit pas
   * pouvoir servir de passe-partout.
   */
  it("n'atteint la bibliothèque d'un étranger sous aucun titre", async () => {
    expect((await dual.get(`/exercises/${strangerExerciseId}`)).status).toBe(404);
    expect((await dual.get("/exercises")).body).toHaveLength(0);
  });

  it("n'atteint le cycle d'un étranger ni en coach ni en athlète", async () => {
    expect((await dual.get(`/plans/${strangerPlanId}`)).status).toBe(404);
    // Côté athlète, il ne lit que le sien : celui de l'étranger n'est pas « le cycle courant ».
    const mine = await dual.get("/me/plan");
    expect(mine.body?.id).not.toBe(strangerPlanId);
  });

  // Sa liste d'athlètes est la SIENNE : celui d'un autre coach n'y figure pas, même si les deux
  // comptes sont coachs.
  it("ne voit que ses propres athlètes", async () => {
    const athletes = await dual.get("/athletes");
    const ids = athletes.body.map((relation: { athleteId: string }) => relation.athleteId);
    expect(ids).toContain(hisAthleteId);
    expect(ids).toContain(dualId); // lui-même (auto-coaching, #14)
    expect(ids).toHaveLength(2);
  });

  /**
   * Le croisement le plus tentant : `dual` est l'athlète de `hisCoach` ET le coach de
   * `hisAthlete`. Ces deux relations ne se composent PAS — `hisCoach` n'a aucun droit sur
   * `hisAthlete`, qui n'est pas son athlète.
   */
  it("ne transmet aucun droit en cascade le long de la chaîne", async () => {
    const athletes = await hisCoach.get("/athletes");
    const ids = athletes.body.map((relation: { athleteId: string }) => relation.athleteId);
    expect(ids).toContain(dualId);
    expect(ids).not.toContain(hisAthleteId);
  });

  /**
   * Un cycle qu'on s'écrit à soi-même reste dans son tenant. Il porte `coachId = athleteId`, donc
   * il apparaîtrait dans DEUX scopes s'ils étaient confondus — c'est précisément le cas où une
   * erreur de colonne ne se verrait pas chez un compte ordinaire.
   */
  it("garde ses cycles solo hors de portée des autres", async () => {
    const solo = await dual.post("/plans").send({
      athleteId: dualId,
      title: "Solo privé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(solo.status).toBe(201);

    expect((await stranger.get(`/plans/${solo.body.id}`)).status).toBe(404);
    // Son propre coach non plus : `dual` s'écrit ce cycle en tant que COACH, pas en tant qu'athlète
    // de `hisCoach`. La relation ne donne pas de droit sur ce que son athlète écrit de son côté.
    expect((await hisCoach.get(`/plans/${solo.body.id}`)).status).toBe(404);
  });

  // Retirer une capacité FERME l'accès, immédiatement et pour tout ce qu'elle ouvrait.
  it("referme l'accès dès qu'une capacité est retirée", async () => {
    const temp = await signUpWith("iso-temp@cmv.test", { isCoach: true, isAthlete: true });
    expect((await temp.get("/exercises")).status).toBe(200);

    expect(
      (await temp.patch("/me/capabilities").send({ isCoach: false, isAthlete: true })).status,
    ).toBe(200);
    expect((await temp.get("/exercises")).status).toBe(403);
    expect((await temp.get("/athletes")).status).toBe(403);
  });

  /**
   * L'invariant qui tient tout : un athlète a AU PLUS un coach, y compris quand il en est un
   * lui-même. Cumuler ne permet pas de se rattacher à un second.
   */
  it("ne laisse pas un compte à double capacité rejoindre un second coach", async () => {
    const invitation = await stranger.post("/invitations").send({});
    const res = await dual.post("/invitations/accept").send({ code: invitation.body.code });
    expect(res.status).toBe(409);
  });
});
