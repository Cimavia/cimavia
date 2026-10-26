import { Role } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import {
  type Agent,
  idOf,
  joinOrganization,
  required,
  signUp,
  signUpWith,
} from "../support/actors";
import { app } from "../support/app";
import { putExerciseFile, uploadInstructionImage } from "../support/fixtures";
import { deleteAtLatest, versionOf } from "../support/version";

/**
 * Copie figée d'un exercice perdu (#609) : quand C supprime un exercice qu'une séance de M cite, ou
 * en ferme l'accès à M, la séance de M en garde une copie que M possède — contenu, documents sous
 * la même clé objet, tags et métriques adoptées dans le catalogue de M.
 *
 * C, M et N sont Coachs de F ; B n'en est pas. Les comptes portent le préfixe `frozen-` pour ne
 * croiser aucun autre domaine.
 */

const COMPANY = { isCoach: false, isAthlete: false, isCompany: true };
const C_NAME = "frozen-c@cmv.test";

const GRADE = { label: "Cotation", unit: null, valueType: "SCALE", scale: ["6a", "6b"] };
const EFFORT = { label: "Effort", unit: "pts", valueType: "NUMBER", scale: null };
/** Suggérée par l'exercice, et citée par aucun bloc : elle doit suivre la copie quand même (#718). */
const PACE = { label: "Allure", unit: "min/km", valueType: "NUMBER", scale: null };
const REPS = { source: "CATALOG", key: "REPETITIONS", unit: "REPS" };

/** Les métriques que l'exercice de C suggère : la sienne seule, l'une de ses blocs, le catalogue. */
const suggestedCiting = (paceId: string, gradeId: string) => [
  { source: "CUSTOM", customMetricId: paceId },
  { source: "CUSTOM", customMetricId: gradeId },
  REPS,
];

/** Un bloc qui cite deux métriques maison, et la valeur que la séance de M y pose. */
const blocksCiting = (gradeId: string, effortId: string, grade: string | null = null) => [
  {
    id: "blk",
    label: null,
    structure: { type: "SERIES", setCount: 1, restBetweenSetsSeconds: null },
    metrics: [
      { id: "col_grade", source: "CUSTOM", customMetricId: gradeId, label: null, collapsed: false },
      {
        id: "col_effort",
        source: "CUSTOM",
        customMetricId: effortId,
        label: null,
        collapsed: false,
      },
    ],
    rows: [{ id: "r1", values: { col_grade: grade, col_effort: null } }],
  },
];

describe("Copie figée : une séance garde l'exercice qu'elle perd", () => {
  let prisma: PrismaService;
  let c: Agent;
  let m: Agent;
  let n: Agent;
  let cId: string;
  let mId: string;
  let nId: string;
  let organizationId: string;
  let gradeId: string;
  let effortId: string;
  let paceId: string;

  const changeAccess = (body: object) => c.patch("/exercises/access").send(body);

  async function grant(exerciseId: string, beneficiary: object, level: "READ" | "WRITE") {
    await prisma.accessGrant.create({ data: { ownerId: cId, exerciseId, ...beneficiary, level } });
  }

  /** Un exercice de C ouvert à F en Lecture, qui cite ses deux métriques. */
  async function sharedExercise(title: string): Promise<string> {
    const created = await c.post("/exercises").send({
      title,
      tags: ["tirage"],
      blocks: blocksCiting(gradeId, effortId),
      suggestedMetrics: suggestedCiting(paceId, gradeId),
    });
    expect(created.status).toBe(201);
    await grant(created.body.id, { organizationId }, "READ");
    return created.body.id;
  }

  /** Une séance de `coach` qui cite l'exercice, avec une valeur posée à son niveau. */
  async function sessionCiting(coach: Agent, exerciseId: string, title: string) {
    const created = await coach.post("/sessions").send({
      title,
      exercises: [
        {
          exerciseId,
          blocks: blocksCiting(gradeId, effortId, "6b"),
          adjustments: [{ path: "blk/rows/r1/col_grade", level: "SESSION" }],
        },
      ],
    });
    expect(created.status).toBe(201);
    return created.body as { id: string; updatedAt: string };
  }

  beforeAll(async () => {
    prisma = app.get(PrismaService);
    const company = await signUpWith("frozen-f@cmv.test", COMPANY);
    c = await signUp(C_NAME, Role.COACH);
    m = await signUp("frozen-m@cmv.test", Role.COACH);
    n = await signUp("frozen-n@cmv.test", Role.COACH);
    for (const coach of [c, m, n]) await joinOrganization(company, coach);
    [organizationId, cId, mId, nId] = await Promise.all([idOf(company), idOf(c), idOf(m), idOf(n)]);

    const [grade, effort, pace] = await Promise.all([
      c.post("/custom-metrics").send(GRADE),
      c.post("/custom-metrics").send(EFFORT),
      c.post("/custom-metrics").send(PACE),
    ]);
    expect([grade.status, effort.status, pace.status]).toEqual([201, 201, 201]);
    [gradeId, effortId, paceId] = [grade.body.id, effort.body.id, pace.body.id];

    // M a déjà une « Cotation », d'une autre nature, et un « Effort » identique à celui de C.
    const [mGrade, mEffort] = await Promise.all([
      m.post("/custom-metrics").send({ ...GRADE, valueType: "NUMBER", scale: null }),
      m.post("/custom-metrics").send(EFFORT),
    ]);
    expect([mGrade.status, mEffort.status]).toEqual([201, 201]);
  });

  it("C supprime l'exercice : la séance de M garde une copie complète, à M, et sa valeur", async () => {
    const tractionId = await sharedExercise("Traction");
    const imageId = await uploadInstructionImage(c, tractionId);
    const topoPath = await putExerciseFile(c, tractionId, {
      fileName: "topo.pdf",
      mimeType: "application/pdf",
      size: 1000,
    });
    const attached = await c.post(`/exercises/${tractionId}/documents`).send({
      type: "FILE",
      storagePath: topoPath,
      fileName: "topo.pdf",
      mimeType: "application/pdf",
      size: 1000,
    });
    const linked = await c
      .post(`/exercises/${tractionId}/documents`)
      .send({ type: "LINK", url: "https://topo.test/traction" });
    expect([attached.status, linked.status]).toEqual([201, 201]);
    const consigne = [{ type: "IMAGE", mediaId: imageId, caption: null }];
    const written = await c.patch(`/exercises/${tractionId}`).send({
      expectedUpdatedAt: await versionOf(c, `/exercises/${tractionId}`),
      instructions: consigne,
    });
    expect(written.status).toBe(200);
    const session = await sessionCiting(m, tractionId, "Séance de M");
    expect((await c.get(`/exercises/${tractionId}`)).body.foreignSessionCount).toBe(1);

    expect((await deleteAtLatest(c, `/exercises/${tractionId}`)).status).toBe(204);

    const read = await m.get(`/sessions/${session.id}`);
    expect(read.status).toBe(200);
    // La séance avance d'une version : un builder resté ouvert reçoit « Recharger ».
    expect(read.body.updatedAt).not.toBe(session.updatedAt);
    const [line] = read.body.exercises;
    expect(line.exerciseId).not.toBe(tractionId);
    expect(line.title).toBe("Traction");
    expect(line.frozenFrom).toMatchObject({ coach: { id: cId, name: C_NAME } });
    expect(line.blocks[0].rows[0].values).toEqual({ col_grade: "6b", col_effort: null });
    expect(line.adjustments).toEqual([{ path: "blk/rows/r1/col_grade", level: "SESSION" }]);

    const copy = await m.get(`/exercises/${line.exerciseId}`);
    expect(copy.body).toMatchObject({
      owner: { id: mId },
      myAccess: { level: "OWNER" },
      frozenFrom: { coach: { id: cId, name: C_NAME } },
      tags: ["tirage"],
      usedInSessionCount: 1,
      foreignSessionCount: 0,
    });
    expect(copy.body.documents.map((doc: { fileName: string | null }) => doc.fileName)).toEqual([
      "prise.jpg",
      "topo.pdf",
      null,
    ]);
    // La consigne cite la copie de son image, pas le document de C.
    const copiedImage = copy.body.documents[0];
    expect(copy.body.instructions).toEqual([
      { type: "IMAGE", mediaId: copiedImage.id, caption: null },
    ]);
    // La garde de purge a laissé en place les objets que la copie cite.
    for (const document of copy.body.documents.slice(0, 2)) {
      expect((await fetch(document.url)).status).toBe(200);
    }

    // Les métriques citées passent au catalogue de M : « Effort » repris, « Cotation » suffixée,
    // et « Allure », que seules les métriques suggérées citent, créée.
    const metrics = (await m.get("/custom-metrics")).body as { id: string; label: string }[];
    const idOfLabel = (label: string) => metrics.find((metric) => metric.label === label)?.id;
    expect(metrics.map((metric) => metric.label).sort()).toEqual([
      "Allure",
      "Cotation",
      `Cotation (${C_NAME})`,
      "Effort",
    ]);
    const cited = [idOfLabel(`Cotation (${C_NAME})`), idOfLabel("Effort")];
    expect(
      line.blocks[0].metrics.map((metric: { customMetricId: string }) => metric.customMetricId),
    ).toEqual(cited);
    expect(line.customMetrics.map((metric: { id: string }) => metric.id)).toEqual(cited);
    expect(
      copy.body.blocks[0].metrics.map(
        (metric: { customMetricId: string }) => metric.customMetricId,
      ),
    ).toEqual(cited);
    expect(copy.body.suggestedMetrics).toEqual(
      suggestedCiting(
        required(idOfLabel("Allure"), "Allure de M"),
        required(idOfLabel(`Cotation (${C_NAME})`), "Cotation adoptée"),
      ),
    );
  });

  it("une seconde copie reprend la métrique suffixée que la première a créée", async () => {
    const dalleId = await sharedExercise("Dalle");
    await sessionCiting(m, dalleId, "Seconde séance de M");

    expect((await deleteAtLatest(c, `/exercises/${dalleId}`)).status).toBe(204);

    const metrics = (await m.get("/custom-metrics")).body as { label: string }[];
    expect(metrics.filter((metric) => metric.label.startsWith("Cotation"))).toHaveLength(2);
  });

  it("C ferme F : M garde une copie, N, qu'une ligne à lui ouvre encore, garde la référence", async () => {
    const pontId = await sharedExercise("Pont");
    await grant(pontId, { coachId: nId }, "READ");
    const ofM = await sessionCiting(m, pontId, "Pont de M");
    const ofN = await sessionCiting(n, pontId, "Pont de N");

    const closed = await changeAccess({
      ids: [pontId],
      changes: [{ organizationId, level: null }],
      coachChanges: [],
    });
    expect(closed.status).toBe(200);

    const lineOf = async (agent: Agent, id: string) =>
      (await agent.get(`/sessions/${id}`)).body.exercises[0];
    const mLine = await lineOf(m, ofM.id);
    expect(mLine.exerciseId).not.toBe(pontId);
    expect((await m.get(`/exercises/${mLine.exerciseId}`)).body.frozenFrom.coach.id).toBe(cId);
    expect((await m.get(`/exercises/${pontId}`)).status).toBe(404);
    expect((await lineOf(n, ofN.id)).exerciseId).toBe(pontId);

    // Fermer la ligne de N, « Aucun » : N en garde une copie à son tour (#608).
    const shut = await changeAccess({
      ids: [pontId],
      changes: [],
      coachChanges: [{ coachId: nId, level: "NONE" }],
    });
    expect(shut.status).toBe(200);
    const nLine = await lineOf(n, ofN.id);
    expect(nLine.exerciseId).not.toBe(pontId);
    expect((await n.get(`/exercises/${nLine.exerciseId}`)).body.owner.id).toBe(nId);
    // L'exercice de C est intact, et ne cite plus aucune séance d'un autre.
    expect((await c.get(`/exercises/${pontId}`)).body.foreignSessionCount).toBe(0);
  });

  it("la séance du propriétaire garde le 409, et la suppression refusée ne laisse aucune copie", async () => {
    const gainageId = await sharedExercise("Gainage");
    await sessionCiting(c, gainageId, "Séance de C");
    const ofM = await sessionCiting(m, gainageId, "Gainage de M");

    const refused = await deleteAtLatest(c, `/exercises/${gainageId}`);
    expect(refused.status).toBe(409);
    expect(refused.body.detail).toBe(
      "Exercice utilisé dans 1 séance(s) : retire-le d'abord de ces séances",
    );
    expect((await m.get(`/sessions/${ofM.id}`)).body.exercises[0].exerciseId).toBe(gainageId);
    expect(await prisma.exercise.count({ where: { coachId: mId, title: "Gainage" } })).toBe(0);
  });

  it("M duplique en variante l'exercice qu'il lit : métriques adoptées, images sous la clé de C", async () => {
    const voieId = await sharedExercise("Voie");
    const imageId = await uploadInstructionImage(c, voieId);
    const linked = await c
      .post(`/exercises/${voieId}/documents`)
      .send({ type: "LINK", url: "https://topo.test/voie" });
    expect(linked.status).toBe(201);
    await c.patch(`/exercises/${voieId}`).send({
      expectedUpdatedAt: await versionOf(c, `/exercises/${voieId}`),
      instructions: [{ type: "IMAGE", mediaId: imageId, caption: null }],
    });

    const variant = await m
      .post(`/exercises/${voieId}/duplicate`)
      .send({ title: "Voie (variante)", blocks: blocksCiting(gradeId, effortId, "6a") });
    expect(variant.status).toBe(201);
    expect(variant.body).toMatchObject({
      owner: { id: mId },
      frozenFrom: null,
      title: "Voie (variante)",
    });
    expect(variant.body.blocks[0].rows[0].values.col_grade).toBe("6a");
    expect(variant.body.customMetrics.map((metric: { label: string }) => metric.label)).toEqual([
      "Allure",
      `Cotation (${C_NAME})`,
      "Effort",
    ]);
    // Les métriques suggérées viennent de la source, et citent le catalogue de M.
    const ofM = new Map<string, string>(
      variant.body.customMetrics.map((metric: { id: string; label: string }) => [
        metric.label,
        metric.id,
      ]),
    );
    expect(variant.body.suggestedMetrics).toEqual(
      suggestedCiting(
        required(ofM.get("Allure"), "Allure de M"),
        required(ofM.get(`Cotation (${C_NAME})`), "Cotation adoptée"),
      ),
    );
    // L'image de consigne suit, sous la clé objet de C ; le lien reste à la source.
    expect(variant.body.documents).toHaveLength(1);
    const [source, copy] = await Promise.all([
      prisma.exerciseDocument.findUniqueOrThrow({ where: { id: imageId } }),
      prisma.exerciseDocument.findUniqueOrThrow({ where: { id: variant.body.documents[0].id } }),
    ]);
    expect(copy).toMatchObject({ coachId: mId, storagePath: source.storagePath });
  });

  it("une variante ne cite que les métriques du propriétaire de la source (400)", async () => {
    const blocId = await sharedExercise("Bloc");
    const own = await m.get("/custom-metrics");
    const mGrade = own.body.find((metric: { label: string }) => metric.label === "Cotation");

    const refused = await m
      .post(`/exercises/${blocId}/duplicate`)
      .send({ title: "Bloc (variante)", blocks: blocksCiting(mGrade.id, effortId) });
    expect(refused.status).toBe(400);
  });
});
