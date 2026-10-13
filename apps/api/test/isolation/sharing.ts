import { Role, STALE_WRITE } from "@cmv/shared";
import { ClsService } from "nestjs-cls";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import type { TenantPrisma } from "../../src/tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../src/tenancy/tenancy.module";
import { TENANT_CLS_KEY, type TenantContext } from "../../src/tenancy/tenant-context.type";
import {
  type Agent,
  idOf,
  joinOrganization,
  linkRelation,
  signUp,
  signUpWith,
} from "../support/actors";
import { app } from "../support/app";
import { mondayOfCurrentWeek, uploadInstructionImage } from "../support/fixtures";
import { deleteAtLatest, patchAtLatest, putAtLatest, versionOf } from "../support/version";

/**
 * Droits d'accès sur les exercices et les séances, accordés à une entreprise (#605).
 *
 * C et M sont Coachs de F ; B n'en est pas. Les comptes portent le préfixe `share-` pour ne croiser
 * aucun autre domaine.
 */

const COMPANY = { isCoach: false, isAthlete: false, isCompany: true };

/**
 * L'extension seule, sous un acteur posé à la main : ce que le filtre ouvre et ferme, sans passer
 * par un service qui vérifierait avant elle.
 */
describe("Extension tenant : un droit accordé à une entreprise ouvre l'élément à ses Coachs", () => {
  let db: TenantPrisma;
  let prisma: PrismaService;
  let cls: ClsService;
  let cId: string;
  let mId: string;
  let bId: string;
  let organizationId: string;
  let exerciseId: string;
  let sessionId: string;

  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const actor: TenantContext = {
      userId,
      capabilities: { isCoach: true, isAthlete: false, isCompany: false },
      exercised: "coach",
    };
    return cls.run(async () => {
      cls.set(TENANT_CLS_KEY, actor);
      return await fn();
    });
  }

  /** Pose le droit de F sur l'exercice et la séance de C, ou le retire (`null`). */
  async function grantF(level: "READ" | "WRITE" | null): Promise<void> {
    await prisma.accessGrant.deleteMany({ where: { organizationId } });
    if (level == null) return;
    await prisma.accessGrant.createMany({
      data: [
        { ownerId: cId, exerciseId, organizationId, level },
        { ownerId: cId, sessionId, organizationId, level },
      ],
    });
  }

  beforeAll(async () => {
    db = app.get<TenantPrisma>(TENANT_PRISMA);
    prisma = app.get(PrismaService);
    cls = app.get(ClsService);

    const company = await signUpWith("share-ext-f@cmv.test", COMPANY);
    const c = await signUp("share-ext-c@cmv.test", Role.COACH);
    const m = await signUp("share-ext-m@cmv.test", Role.COACH);
    const b = await signUp("share-ext-b@cmv.test", Role.COACH);
    await joinOrganization(company, c);
    await joinOrganization(company, m);
    [organizationId, cId, mId, bId] = await Promise.all([idOf(company), idOf(c), idOf(m), idOf(b)]);

    const exercise = await c.post("/exercises").send({ title: "Traction", tags: ["renfo"] });
    expect(exercise.status).toBe(201);
    exerciseId = exercise.body.id;
    const session = await c
      .post("/sessions")
      .send({ title: "Bloc tirage", exercises: [{ exerciseId }] });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
  });

  const readExercise = (userId: string) =>
    as(userId, () => db.exercise.findFirst({ where: { id: exerciseId } }));

  it("sans droit, M ne lit rien de C, enfants compris", async () => {
    await grantF(null);

    await expect(readExercise(mId)).resolves.toBeNull();
    await expect(
      as(mId, () => db.exerciseTag.findMany({ where: { exerciseId } })),
    ).resolves.toEqual([]);
    await expect(as(mId, () => db.session.findMany({ where: { id: sessionId } }))).resolves.toEqual(
      [],
    );
    await expect(
      as(mId, () => db.sessionExercise.findMany({ where: { sessionId } })),
    ).resolves.toEqual([]);
  });

  it("en Lecture, M lit l'exercice, ses enfants et la séance, mais n'écrit rien", async () => {
    await grantF("READ");

    await expect(readExercise(mId)).resolves.toMatchObject({ id: exerciseId, coachId: cId });
    await expect(
      as(mId, () => db.exerciseTag.findMany({ where: { exerciseId } })),
    ).resolves.toMatchObject([{ name: "renfo", coachId: cId }]);
    await expect(as(mId, () => db.sessionExercise.count({ where: { sessionId } }))).resolves.toBe(
      1,
    );

    await expect(
      as(mId, () =>
        db.exercise.updateMany({ where: { id: exerciseId }, data: { title: "Lu seulement" } }),
      ),
    ).resolves.toEqual({ count: 0 });
    await expect(
      as(mId, () => db.exerciseTag.create({ data: { exerciseId, name: "intrus" } as never })),
    ).rejects.toThrow("[tenancy] ExerciseTag : son Exercise est introuvable, ou fermé en écriture");
    await expect(
      as(mId, () => db.exerciseTag.deleteMany({ where: { exerciseId } })),
    ).resolves.toEqual({ count: 0 });
  });

  it("en Écriture, M modifie le contenu, et ce qu'il ajoute reste chez C", async () => {
    await grantF("WRITE");

    await expect(
      as(mId, () =>
        db.exercise.update({ where: { id: exerciseId }, data: { title: "Traction lestée" } }),
      ),
    ).resolves.toMatchObject({ title: "Traction lestée", coachId: cId });

    // Piège n°7 : l'enfant que crée le rédacteur prend le propriétaire du parent, pas l'acteur.
    const tag = await as(mId, () =>
      db.exerciseTag.create({ data: { exerciseId, name: "ajouté-par-m" } as never }),
    );
    expect(tag.coachId).toBe(cId);

    // Retirer un enfant, c'est écrire dans l'élément.
    await expect(
      as(mId, () => db.exerciseTag.deleteMany({ where: { id: tag.id } })),
    ).resolves.toEqual({ count: 1 });
  });

  it("même en Écriture, M ne supprime ni l'exercice ni la séance", async () => {
    await grantF("WRITE");

    await expect(
      as(mId, () => db.exercise.deleteMany({ where: { id: exerciseId } })),
    ).resolves.toEqual({ count: 0 });
    await expect(
      as(mId, () => db.session.deleteMany({ where: { id: sessionId } })),
    ).resolves.toEqual({ count: 0 });
    await expect(readExercise(mId)).resolves.not.toBeNull();
  });

  it("un Coach hors de F ne lit rien, même quand F a un droit", async () => {
    await grantF("WRITE");

    await expect(readExercise(bId)).resolves.toBeNull();
    await expect(as(bId, () => db.session.count({ where: { id: sessionId } }))).resolves.toBe(0);
  });

  // La ligne d'un Coach viendra avec #608 : d'ici là, aucune n'est écrite, et le filtre l'ignore.
  it("une ligne de Coach n'ouvre rien avant #608", async () => {
    await grantF(null);
    await prisma.accessGrant.create({
      data: { ownerId: cId, exerciseId, coachId: bId, level: "WRITE" },
    });

    await expect(readExercise(bId)).resolves.toBeNull();
    await prisma.accessGrant.deleteMany({ where: { coachId: bId } });
  });

  /**
   * Le filtre composé s'AJOUTE à celui de l'appelant : posé à plat, son `OR` aurait remplacé celui
   * du service — et une recherche serait devenue le filtre tenant, ou l'inverse.
   */
  it("garde les OR et AND de l'appelant, en tableau comme en objet", async () => {
    await grantF("READ");
    const own = await as(mId, () =>
      db.exercise.create({ data: { title: "Gainage", titleSearch: "gainage" } as never }),
    );

    const byOr = await as(mId, () =>
      db.exercise.findMany({
        where: { OR: [{ id: exerciseId }, { id: own.id }] },
        orderBy: { title: "asc" },
      }),
    );
    expect(byOr.map((row) => row.id)).toEqual([own.id, exerciseId]);

    const byAndObject = await as(mId, () =>
      db.exercise.findMany({ where: { AND: { id: own.id } } }),
    );
    expect(byAndObject.map((row) => row.id)).toEqual([own.id]);

    const byAndList = await as(bId, () =>
      db.exercise.findMany({ where: { AND: [{ id: exerciseId }] } }),
    );
    expect(byAndList).toEqual([]);
  });

  it("garde le filtre de l'appelant sur la relation qu'un enfant suit pour son scope", async () => {
    await grantF("READ");
    const other = await prisma.session.create({ data: { coachId: cId, title: "Autre" } });
    await prisma.sessionExercise.create({
      data: { coachId: cId, sessionId: other.id, exerciseId, position: 0 },
    });

    // C lit les deux séances : sans son filtre, il recevrait aussi la ligne d'« Autre ».
    const composed = await as(cId, () =>
      db.sessionExercise.findMany({ where: { session: { title: "Bloc tirage" } } }),
    );
    expect(composed.map((row) => row.sessionId)).toEqual([sessionId]);
    // Écrire à travers la même relation ne déborde pas non plus sur l'autre séance.
    await expect(
      as(cId, () => db.sessionExercise.deleteMany({ where: { session: { title: "Autre" } } })),
    ).resolves.toEqual({ count: 1 });
    await expect(as(cId, () => db.sessionExercise.count({ where: { sessionId } }))).resolves.toBe(
      1,
    );
  });

  /**
   * Prisma regroupe les `findUnique` d'un même tick et rend à chacun sa ligne en comparant le
   * `where` (« Tranché en #626 ») — or un filtre de relation n'est pas dans la ligne rendue
   * (« Tranché en #603 »). Trois lectures simultanées du même id : chacun reçoit ce qu'il a le
   * droit de lire, et le Coach hors de F rien.
   */
  it("trois findUnique simultanés sur le même id ne se répondent pas l'un l'autre", async () => {
    await grantF("READ");
    const read = (userId: string) =>
      as(userId, () => db.exercise.findUnique({ where: { id: exerciseId } }));

    const [owner, granted, outsider] = await Promise.all([read(cId), read(mId), read(bId)]);

    expect(owner).toMatchObject({ id: exerciseId, coachId: cId });
    expect(granted).toMatchObject({ id: exerciseId, coachId: cId });
    expect(outsider).toBeNull();
  });
});

/** Un bloc d'une colonne, qui cite la métrique maison `customMetricId`. */
const citing = (customMetricId: string) => [
  {
    id: "blk_grade",
    label: null,
    structure: { type: "SERIES", setCount: 1, restBetweenSetsSeconds: null },
    metrics: [{ id: "col_grade", source: "CUSTOM", customMetricId, label: null, collapsed: false }],
    rows: [{ id: "r1", values: {} }],
  },
];

/**
 * Par l'API : ce que M compose avec ce que C lui ouvre (#353, #605). La garde des exercices cités
 * accepte ce qui est LISIBLE, plus seulement possédé ; un exercice privé se lit à travers la
 * séance ouverte qui le cite ; les métriques maison se lisent chez le propriétaire.
 *
 * C ouvre à F, en Lecture, l'exercice « Voie » et la séance « Grimpe » ; « Dalle », cité par la
 * séance, reste privé. Comptes `share-api-`.
 */
describe("Bibliothèque partagée : M compose avec ce que C ouvre à F", () => {
  let prisma: PrismaService;
  let c: Agent;
  let m: Agent;
  let b: Agent;
  let cId: string;
  let organizationId: string;
  let gradeId: string;
  let voieId: string;
  let dalleId: string;
  let grimpeId: string;
  let mWeekId: string;
  let dalleImageId: string;
  let plannedId: string;
  let mId: string;
  let athlete: Agent;
  let company: Agent;

  async function grantF(
    level: "READ" | "WRITE",
    target: { exerciseId?: string; sessionId?: string },
  ) {
    await prisma.accessGrant.deleteMany({ where: { organizationId, ...target } });
    await prisma.accessGrant.create({ data: { ownerId: cId, organizationId, level, ...target } });
  }

  beforeAll(async () => {
    prisma = app.get(PrismaService);
    company = await signUpWith("share-api-f@cmv.test", COMPANY);
    c = await signUp("share-api-c@cmv.test", Role.COACH);
    m = await signUp("share-api-m@cmv.test", Role.COACH);
    b = await signUp("share-api-b@cmv.test", Role.COACH);
    await joinOrganization(company, c);
    await joinOrganization(company, m);
    [organizationId, cId, mId] = await Promise.all([idOf(company), idOf(c), idOf(m)]);

    const grade = await c
      .post("/custom-metrics")
      .send({ label: "Cotation", unit: null, valueType: "SCALE", scale: ["6a", "6b"] });
    expect(grade.status).toBe(201);
    gradeId = grade.body.id;

    const voie = await c
      .post("/exercises")
      .send({ title: "Voie", tags: ["voie"], blocks: citing(gradeId) });
    const dalle = await c.post("/exercises").send({ title: "Dalle", tags: ["équilibre"] });
    expect([voie.status, dalle.status]).toEqual([201, 201]);
    [voieId, dalleId] = [voie.body.id, dalle.body.id];
    dalleImageId = await uploadInstructionImage(c, dalleId);

    const grimpe = await c.post("/sessions").send({
      title: "Grimpe",
      exercises: [{ exerciseId: voieId }, { exerciseId: dalleId }],
    });
    expect(grimpe.status).toBe(201);
    grimpeId = grimpe.body.id;
    await grantF("READ", { exerciseId: voieId });
    await grantF("READ", { sessionId: grimpeId });

    athlete = await signUp("share-api-te@cmv.test", Role.ATHLETE);
    const { athleteId } = await linkRelation(m, athlete);
    const plan = await m.post("/plans").send({
      athleteId,
      title: "Cycle de M",
      startDate: mondayOfCurrentWeek(),
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    mWeekId = plan.body.weeks[0].id;
  });

  it("la séance de M cite l'exercice que C ouvre à F, avec les métriques de C", async () => {
    const created = await m
      .post("/sessions")
      .send({ title: "Séance de M", exercises: [{ exerciseId: voieId }] });

    expect(created.status).toBe(201);
    expect(created.body.exercises[0]).toMatchObject({
      exerciseId: voieId,
      title: "Voie",
      customMetrics: [{ id: gradeId, label: "Cotation" }],
    });
  });

  it("la séance de M ne cite ni l'exercice privé de C, ni celui que C ouvre à un Coach hors de F", async () => {
    const privateOne = await m
      .post("/sessions")
      .send({ title: "Intrusion", exercises: [{ exerciseId: dalleId }] });
    expect(privateOne.status).toBe(400);
    expect(privateOne.body.message).toBe("Un ou plusieurs exercices sont inconnus");

    const outsider = await b
      .post("/sessions")
      .send({ title: "Intrusion", exercises: [{ exerciseId: voieId }] });
    expect(outsider.status).toBe(400);
  });

  it("l'exercice privé se lit dans la séance ouverte qui le cite, pas dans la bibliothèque", async () => {
    const session = await m.get(`/sessions/${grimpeId}`);
    expect(session.status).toBe(200);
    expect(session.body.exercises.map((row: { title: string }) => row.title)).toEqual([
      "Voie",
      "Dalle",
    ]);
    expect(session.body.exercises[1].tags).toEqual(["équilibre"]);

    expect((await m.get(`/exercises/${dalleId}`)).status).toBe(404);
    const library = await m.get("/exercises");
    expect(library.body.map((row: { id: string }) => row.id)).not.toContain(dalleId);
  });

  it("la planification de M recopie la séance de C, exercice privé et métriques comprises", async () => {
    const planned = await m
      .post(`/plan-weeks/${mWeekId}/sessions`)
      .send({ sourceSessionId: grimpeId, scheduledDate: mondayOfCurrentWeek() });

    expect(planned.status).toBe(201);
    plannedId = planned.body.id;
    expect(planned.body.exercises).toMatchObject([
      { title: "Voie", sourceExerciseId: voieId, customMetrics: [{ id: gradeId }] },
      { title: "Dalle", sourceExerciseId: dalleId, customMetrics: [] },
    ]);
  });

  it("hors d'une séance qui le cite, l'exercice privé reste refusé à la planification", async () => {
    const adHoc = await m.post(`/plan-weeks/${mWeekId}/sessions`).send({
      title: "Ad hoc",
      scheduledDate: mondayOfCurrentWeek(),
      exercises: [{ title: "Dalle", sourceExerciseId: dalleId }],
    });
    expect(adHoc.status).toBe(400);
    expect(adHoc.body.message).toBe("Un ou plusieurs exercices sont inconnus");
  });

  it("M réenregistre sa planification sans repasser ses lignes copiées par la bibliothèque", async () => {
    const path = `/scheduled-sessions/${plannedId}`;
    const planned = await m.get(path);
    // Lignes reprises, envoyées SANS leurs métriques : Dalle n'est lisible qu'à travers Grimpe, et
    // une ligne déjà copiée ne doit rien à la bibliothèque.
    const exercises = planned.body.exercises.map(
      (row: { id: string; sourceExerciseId: string; title: string; blocks: unknown }) => ({
        id: row.id,
        sourceExerciseId: row.sourceExerciseId,
        title: row.title,
        blocks: row.blocks,
      }),
    );
    const saved = await putAtLatest(m, path, {
      title: planned.body.title,
      scheduledDate: planned.body.scheduledDate,
      exercises,
    });

    expect(saved.status).toBe(200);
    expect(saved.body.exercises).toMatchObject([
      { title: "Voie", customMetrics: [{ id: gradeId }] },
      { title: "Dalle", customMetrics: [] },
    ]);
  });

  it("le sélecteur de métriques de l'exercice de C propose le catalogue de C, à M comme à C", async () => {
    const own = await m
      .post("/custom-metrics")
      .send({ label: "Ressenti de M", unit: null, valueType: "NUMBER", scale: null });
    expect(own.status).toBe(201);

    for (const reader of [c, m]) {
      const catalog = await reader.get(`/exercises/${voieId}/custom-metrics`);
      expect(catalog.status).toBe(200);
      expect(catalog.body.map((metric: { id: string }) => metric.id)).toEqual([gradeId]);
    }
    expect((await b.get(`/exercises/${voieId}/custom-metrics`)).status).toBe(404);
  });

  it("en Écriture, M ne cite dans l'exercice de C que les métriques de C", async () => {
    await grantF("WRITE", { exerciseId: voieId });
    const own = await m.get("/custom-metrics");
    const mine = own.body.find((metric: { label: string }) => metric.label === "Ressenti de M");

    const foreign = await m.patch(`/exercises/${voieId}`).send({
      expectedUpdatedAt: await versionOf(m, `/exercises/${voieId}`),
      blocks: citing(mine.id),
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.message).toMatch(/catalogue du propriétaire/);

    const owners = await m.patch(`/exercises/${voieId}`).send({
      expectedUpdatedAt: await versionOf(m, `/exercises/${voieId}`),
      title: "Voie déversante",
      blocks: citing(gradeId),
    });
    expect(owners.status).toBe(200);
    expect(owners.body).toMatchObject({ coachId: cId, customMetrics: [{ id: gradeId }] });

    await grantF("READ", { exerciseId: voieId });
  });

  it("C ne supprime pas l'exercice qu'une séance de M cite, et le message les compte à part", async () => {
    const refused = await deleteAtLatest(c, `/exercises/${voieId}`);

    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe("Exercice utilisé dans 2 séance(s), dont 1 d'un autre coach");
  });

  it("le document que C retire reste en storage tant que la planification de M le recopie", async () => {
    expect((await c.delete(`/exercises/${dalleId}/documents/${dalleImageId}`)).status).toBe(204);

    const planned = await m.get(`/scheduled-sessions/${plannedId}`);
    const copy = planned.body.exercises[1].documents[0];
    expect(copy).toBeDefined();
    expect((await fetch(copy.url)).status).toBe(200);
  });

  /**
   * MC-8 : la bibliothèque s'écrit désormais à plusieurs. Le propriétaire qui supprime sur ce qu'il
   * a lu avant l'écriture d'un rédacteur supprimerait ce qu'il n'a pas vu.
   */
  it("C ne supprime pas, sur une version périmée, ce que M vient d'écrire", async () => {
    const pont = await c.post("/exercises").send({ title: "Pont" });
    const retour = await c.post("/sessions").send({ title: "Retour au calme", exercises: [] });
    await grantF("WRITE", { exerciseId: pont.body.id });
    await grantF("WRITE", { sessionId: retour.body.id });
    const exercisePath = `/exercises/${pont.body.id}`;
    const sessionPath = `/sessions/${retour.body.id}`;
    const [exerciseSeen, sessionSeen] = await Promise.all([
      versionOf(c, exercisePath),
      versionOf(c, sessionPath),
    ]);

    expect((await patchAtLatest(m, exercisePath, { title: "Pont fessier" })).status).toBe(200);
    const put = await putAtLatest(m, sessionPath, { title: "Retour", notes: null, exercises: [] });
    expect(put.status).toBe(200);

    const cases: [string, string][] = [
      [exercisePath, exerciseSeen],
      [sessionPath, sessionSeen],
    ];
    for (const [path, seen] of cases) {
      const stale = await c.delete(path).query({ expectedUpdatedAt: seen });
      expect(stale.status).toBe(409);
      expect(stale.body.message).toBe(STALE_WRITE);
      expect((await c.delete(path)).status).toBe(400);
      expect((await deleteAtLatest(c, path)).status).toBe(204);
    }
  });

  it("le DTO dit qui possède l'élément et d'où vient le droit ; les droits, au propriétaire seul", async () => {
    const owner = { id: cId, name: "share-api-c@cmv.test" };
    const f = { id: organizationId, name: "share-api-f@cmv.test" };

    for (const path of [`/exercises/${voieId}`, `/sessions/${grimpeId}`]) {
      const asOwner = await c.get(path);
      expect(asOwner.body).toMatchObject({
        owner,
        myAccess: { level: "OWNER", via: null },
        grants: [{ organization: f, level: "READ" }],
      });

      const asReader = await m.get(path);
      expect(asReader.body).toMatchObject({ owner, myAccess: { level: "READ", via: f } });
      expect(asReader.body.grants).toBeNull();
    }
  });

  it("en Lecture, M prend 403 sur toute écriture ; hors de F, B prend 404 et n'apprend rien", async () => {
    const session = await m.get(`/sessions/${grimpeId}`);
    const exerciseVersion = await versionOf(m, `/exercises/${voieId}`);
    const writes = (agent: Agent, version: string) => [
      agent.patch(`/exercises/${voieId}`).send({ expectedUpdatedAt: version, title: "Pris" }),
      agent
        .post(`/exercises/${voieId}/documents/upload-url`)
        .send({ fileName: "a.pdf", mimeType: "application/pdf", size: 1000 }),
      agent.post(`/exercises/${voieId}/documents`).send({ type: "LINK", url: "https://x.test" }),
      agent.post(`/exercises/${voieId}/duplicate`).send({ title: "Ma variante" }),
      agent.delete(`/exercises/${voieId}`).query({ expectedUpdatedAt: version }),
      agent.put(`/sessions/${grimpeId}`).send({
        expectedUpdatedAt: session.body.updatedAt,
        title: "Prise",
        notes: null,
        exercises: [],
      }),
      agent
        .post(`/sessions/${grimpeId}/exercises/${session.body.exercises[0].id}/reload`)
        .send({ expectedUpdatedAt: session.body.updatedAt }),
      agent.delete(`/sessions/${grimpeId}`).query({ expectedUpdatedAt: session.body.updatedAt }),
    ];

    const asReader = await Promise.all(writes(m, exerciseVersion));
    expect(asReader.map((res) => res.status)).toEqual([403, 403, 403, 403, 403, 403, 403, 403]);
    const asOutsider = await Promise.all(writes(b, exerciseVersion));
    expect(asOutsider.map((res) => res.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404]);
    expect((await b.get(`/exercises/${voieId}`)).status).toBe(404);
    expect((await b.get(`/sessions/${grimpeId}`)).status).toBe(404);

    // Rien n'a bougé.
    expect((await c.get(`/exercises/${voieId}`)).body.updatedAt).toBe(exerciseVersion);
    expect((await c.get(`/sessions/${grimpeId}`)).body.updatedAt).toBe(session.body.updatedAt);
  });

  it("même en Écriture, M ne supprime pas, ne duplique pas, mais modifie et recharge", async () => {
    await grantF("WRITE", { exerciseId: voieId });
    await grantF("WRITE", { sessionId: grimpeId });

    const exercisePath = `/exercises/${voieId}`;
    expect((await deleteAtLatest(m, exercisePath)).status).toBe(403);
    expect((await m.post(`${exercisePath}/duplicate`).send({ title: "Variante" })).status).toBe(
      403,
    );
    expect((await deleteAtLatest(m, `/sessions/${grimpeId}`)).status).toBe(403);

    const session = await m.get(`/sessions/${grimpeId}`);
    const reloaded = await m
      .post(`/sessions/${grimpeId}/exercises/${session.body.exercises[1].id}/reload`)
      .send({ expectedUpdatedAt: session.body.updatedAt });
    expect(reloaded.status).toBe(201);
    expect(reloaded.body.myAccess.level).toBe("WRITE");

    // Le document qu'il envoie se range sous le préfixe de C, propriétaire de l'exercice.
    const ticket = await m
      .post(`${exercisePath}/documents/upload-url`)
      .send({ fileName: "topo.pdf", mimeType: "application/pdf", size: 1000 });
    expect(ticket.status).toBe(201);
    expect(ticket.body.storagePath).toMatch(new RegExp(`^coach/${cId}/exercises/${voieId}/`));

    await grantF("READ", { exerciseId: voieId });
    await grantF("READ", { sessionId: grimpeId });
  });

  it("?scope= trie ce que M lit : le sien, ce qu'on lui ouvre, ou tout", async () => {
    const ids = async (path: string) =>
      ((await m.get(path)).body as { id: string; coachId: string }[]).map((row) => row.coachId);
    expect((await m.post("/exercises").send({ title: "Gainage de M" })).status).toBe(201);

    expect(new Set(await ids("/exercises?scope=mine"))).toEqual(new Set([mId]));
    expect(new Set(await ids("/exercises?scope=shared"))).toEqual(new Set([cId]));
    expect(new Set(await ids("/exercises"))).toEqual(new Set([mId, cId]));
    expect(new Set(await ids("/sessions?scope=shared"))).toEqual(new Set([cId]));
    expect(new Set(await ids("/sessions?scope=mine"))).toEqual(new Set([mId]));

    expect((await m.get("/exercises?scope=others")).status).toBe(400);
    expect((await m.get("/sessions?scope=others")).status).toBe(400);
  });

  it("l'autocomplétion des tags couvre ce que M lit, pas l'exercice privé de C", async () => {
    const tags = (await m.get("/exercises/tags")).body;
    expect(tags).toContain("voie");
    expect(tags).not.toContain("équilibre");
    expect((await m.get("/exercises?tag=voie")).body.map((row: { id: string }) => row.id)).toEqual([
      voieId,
    ]);
  });

  it("GET /me/organizations rend les entreprises du Coach et leurs Coachs ; à personne d'autre", async () => {
    const mine = await m.get("/me/organizations");
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual([
      {
        id: organizationId,
        name: "share-api-f@cmv.test",
        coaches: [
          { coachId: cId, name: "share-api-c@cmv.test" },
          { coachId: mId, name: "share-api-m@cmv.test" },
        ],
      },
    ]);

    expect((await b.get("/me/organizations")).body).toEqual([]);
    expect((await athlete.get("/me/organizations")).status).toBe(403);
    expect((await company.get("/me/organizations")).status).toBe(403);
  });

  it("ni l'athlète ni l'entreprise n'atteignent la bibliothèque", async () => {
    for (const agent of [athlete, company]) {
      for (const path of [
        "/exercises",
        `/exercises/${voieId}`,
        "/sessions",
        `/sessions/${grimpeId}`,
      ]) {
        expect((await agent.get(path)).status).toBe(403);
      }
    }
  });

  describe("API des accès : C gère ce qu'il ouvre, élément par élément ou en lot", () => {
    let gId: string;
    let hId: string;
    let d: Agent;

    const changeAccess = (agent: Agent, kind: "exercises" | "sessions", body: object) =>
      agent.patch(`/${kind}/access`).send(body);
    const grantOf = (id: string, name: string, level: "READ" | "WRITE") => ({
      organization: { id, name },
      level,
    });

    beforeAll(async () => {
      const g = await signUpWith("share-api-g@cmv.test", COMPANY);
      const h = await signUpWith("share-api-h@cmv.test", COMPANY);
      d = await signUp("share-api-d@cmv.test", Role.COACH);
      await joinOrganization(g, c);
      await joinOrganization(g, d);
      [gId, hId] = await Promise.all([idOf(g), idOf(h)]);
    });

    it("un lot n'écrit que les entreprises citées : la ligne laissée « Mixte » garde sa valeur", async () => {
      const pan = await c.post("/exercises").send({ title: "Pan" });
      const campus = await c.post("/exercises").send({ title: "Campus" });
      const [panId, campusId] = [pan.body.id, campus.body.id];
      const f = (level: "READ" | "WRITE") => grantOf(organizationId, "share-api-f@cmv.test", level);
      const g = (level: "READ" | "WRITE") => grantOf(gId, "share-api-g@cmv.test", level);

      const opened = await changeAccess(c, "exercises", {
        ids: [panId],
        changes: [{ organizationId, level: "READ" }],
      });
      expect(opened.status).toBe(200);
      expect(opened.body).toEqual([{ id: panId, grants: [f("READ")] }]);

      const batch = await changeAccess(c, "exercises", {
        ids: [campusId, panId],
        changes: [{ organizationId: gId, level: "WRITE" }],
      });
      expect(batch.status).toBe(200);
      // Dans l'ordre des ids reçus ; F reste en Lecture sur Pan et n'apparaît pas sur Campus.
      expect(batch.body).toEqual([
        { id: campusId, grants: [g("WRITE")] },
        { id: panId, grants: [f("READ"), g("WRITE")] },
      ]);

      const removed = await changeAccess(c, "exercises", {
        ids: [panId, campusId],
        changes: [{ organizationId, level: null }],
      });
      expect(removed.body).toEqual([
        { id: panId, grants: [g("WRITE")] },
        { id: campusId, grants: [g("WRITE")] },
      ]);
      expect((await c.get(`/exercises/${panId}`)).body.grants).toEqual([g("WRITE")]);
      // Hors de G, M ne lit plus Pan.
      expect((await m.get(`/exercises/${panId}`)).status).toBe(404);
    });

    it("M ne gère aucun accès, même en Écriture ; B n'apprend rien ; ni l'athlète ni l'entreprise", async () => {
      const voie = { ids: [voieId], changes: [{ organizationId, level: "WRITE" }] };
      const grimpe = { ids: [grimpeId], changes: [{ organizationId, level: "WRITE" }] };
      expect((await changeAccess(m, "exercises", voie)).status).toBe(403);
      expect((await changeAccess(m, "sessions", grimpe)).status).toBe(403);

      await grantF("WRITE", { exerciseId: voieId });
      const writer = await changeAccess(m, "exercises", voie);
      expect(writer.status).toBe(403);
      expect(writer.body.message).toBe("Seul le propriétaire peut gérer les accès de cet élément");
      await grantF("READ", { exerciseId: voieId });

      expect((await changeAccess(b, "exercises", voie)).status).toBe(404);
      expect((await changeAccess(b, "sessions", grimpe)).status).toBe(404);
      // Un id illisible dans le lot fait tout refuser, sans dire lequel.
      const mixed = await changeAccess(c, "exercises", { ...voie, ids: [voieId, "inconnu"] });
      expect(mixed.status).toBe(404);
      for (const agent of [athlete, company]) {
        expect((await changeAccess(agent, "exercises", voie)).status).toBe(403);
      }
      const owner = await c.get(`/exercises/${voieId}`);
      expect(owner.body.grants).toEqual([grantOf(organizationId, "share-api-f@cmv.test", "READ")]);
    });

    it("C n'ouvre qu'à une entreprise dont il est membre, et « Aucun » n'est pas un niveau", async () => {
      const foreign = await changeAccess(c, "exercises", {
        ids: [voieId],
        changes: [{ organizationId: hId, level: "READ" }],
      });
      expect(foreign.status).toBe(400);
      expect(foreign.body.message).toBe(
        "Tu ne peux ouvrir un accès qu'à une entreprise dont tu es membre",
      );
      // Retirer une ligne qui n'existe pas n'ouvre rien : permis, et sans effet.
      const absent = await changeAccess(c, "exercises", {
        ids: [voieId],
        changes: [{ organizationId: hId, level: null }],
      });
      expect(absent.status).toBe(200);

      const none = await changeAccess(c, "exercises", {
        ids: [voieId],
        changes: [{ organizationId, level: "NONE" }],
      });
      expect(none.status).toBe(400);
    });

    it("C ne retire pas à F l'exercice qu'une séance de M cite ; réduire à Lecture reste permis", async () => {
      const refused = await changeAccess(c, "exercises", {
        ids: [voieId],
        changes: [{ organizationId, level: null }],
      });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe(
        "Impossible de réduire cet accès : l'exercice est utilisé dans 1 séance(s) d'un autre coach",
      );
      expect((await m.get(`/exercises/${voieId}`)).status).toBe(200);

      for (const level of ["WRITE", "READ"]) {
        const changed = await changeAccess(c, "exercises", {
          ids: [voieId],
          changes: [{ organizationId, level }],
        });
        expect(changed.status).toBe(200);
      }

      // G, dont M n'est pas membre, ne lui ouvrait rien : la retirer ne lui retire rien.
      await changeAccess(c, "exercises", {
        ids: [voieId],
        changes: [{ organizationId: gId, level: "READ" }],
      });
      const withoutG = await changeAccess(c, "exercises", {
        ids: [voieId],
        changes: [{ organizationId: gId, level: null }],
      });
      expect(withoutG.status).toBe(200);
    });

    it("retirer une séance à F ne touche pas la planification que M en a tirée : c'est une copie", async () => {
      const closed = await changeAccess(c, "sessions", {
        ids: [grimpeId],
        changes: [{ organizationId, level: null }],
      });
      expect(closed.status).toBe(200);
      expect(closed.body).toEqual([{ id: grimpeId, grants: [] }]);
      expect((await m.get(`/sessions/${grimpeId}`)).status).toBe(404);
      expect((await m.get(`/scheduled-sessions/${plannedId}`)).status).toBe(200);

      const reopened = await changeAccess(c, "sessions", {
        ids: [grimpeId],
        changes: [{ organizationId, level: "READ" }],
      });
      expect(reopened.status).toBe(200);
      expect((await m.get(`/sessions/${grimpeId}`)).status).toBe(200);
    });

    it("l'exercice d'un tiers ne passe pas par la séance qui le cite : ses droits bornent sa diffusion", async () => {
      // D ouvre Toit à G ; C, qui le lit par G, le cite dans « Mixte », qu'il ouvre à F.
      const toit = await d.post("/exercises").send({ title: "Toit", description: "Secret de D" });
      const toitId = toit.body.id;
      await changeAccess(d, "exercises", {
        ids: [toitId],
        changes: [{ organizationId: gId, level: "READ" }],
      });
      const mixte = await c.post("/sessions").send({
        title: "Mixte",
        exercises: [{ exerciseId: toitId }, { exerciseId: voieId }],
      });
      expect(mixte.status).toBe(201);
      await changeAccess(c, "sessions", {
        ids: [mixte.body.id],
        changes: [{ organizationId, level: "WRITE" }],
      });

      // M lit la séance et ce qu'elle compose, mais n'en tire pas Toit : ni copie, ni rechargement,
      // ni nouvelle ligne. Ses lignes reprises, elles, s'enregistrent.
      const session = await m.get(`/sessions/${mixte.body.id}`);
      expect(session.status).toBe(200);
      expect((await m.get(`/exercises/${toitId}`)).status).toBe(404);
      const planned = await m
        .post(`/plan-weeks/${mWeekId}/sessions`)
        .send({ sourceSessionId: mixte.body.id, scheduledDate: mondayOfCurrentWeek() });
      expect(planned.status).toBe(400);
      expect(planned.body.message).toBe("Un ou plusieurs exercices sont inconnus");
      // Sans Toit dans la composition qu'il envoie, M planifie : la copie qu'il remplace n'est
      // pas validée pour rien.
      const composed = await m.post(`/plan-weeks/${mWeekId}/sessions`).send({
        sourceSessionId: mixte.body.id,
        scheduledDate: mondayOfCurrentWeek(),
        exercises: [{ title: "Voie", sourceExerciseId: voieId }],
      });
      expect(composed.status).toBe(201);
      expect(composed.body).toMatchObject({
        title: "Mixte",
        exercises: [{ title: "Voie", sourceExerciseId: voieId, customMetrics: [] }],
      });
      const [toitRow, voieRow] = session.body.exercises;
      const reload = await m
        .post(`/sessions/${mixte.body.id}/exercises/${toitRow.id}/reload`)
        .send({ expectedUpdatedAt: session.body.updatedAt });
      expect(reload.status).toBe(400);
      expect(reload.body.message).toBe("Un ou plusieurs exercices sont inconnus");
      const kept = [
        { id: toitRow.id, exerciseId: toitId },
        { id: voieRow.id, exerciseId: voieId },
      ];
      const added = await putAtLatest(m, `/sessions/${mixte.body.id}`, {
        title: "Mixte",
        exercises: [...kept, { exerciseId: toitId }],
      });
      expect(added.status).toBe(400);
      expect(added.body.message).toBe("Un ou plusieurs exercices sont inconnus");
      const saved = await putAtLatest(m, `/sessions/${mixte.body.id}`, {
        title: "Mixte",
        exercises: kept,
      });
      expect(saved.status).toBe(200);

      // C, lui, le lit en direct : c'est par G, pas par sa séance.
      expect((await c.get(`/exercises/${toitId}`)).status).toBe(200);
    });
  });
});
