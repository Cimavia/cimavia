import type { EnvSchema } from "@cmv/shared";
import { Role } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import type { PinoLogger } from "nestjs-pino";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { ORPHAN_GRACE_MS } from "../../src/infra/storage/orphan-sweep";
import { OrphanSweepService } from "../../src/infra/storage/orphan-sweep.service";
import { StorageService } from "../../src/infra/storage/storage.service";
import { type Agent, idOf, linkRelation, signUp } from "../support/actors";
import { app } from "../support/app";
import { attachInvoiceDocument, mondayOfCurrentWeek, putExerciseFile } from "../support/fixtures";

/**
 * Le compte root du SILO de `docker-compose.yml` — en local comme en CI. Le balayage liste le
 * bucket, ce que la clé d'API de la suite n'a pas le droit de faire (« Tranché en #267 ») : il
 * tourne ici comme en vrai, sous l'identité root, dans une instance de storage à part.
 */
const SILO_ROOT: Record<string, string> = {
  S3_ACCESS_KEY_ID: "cimavia",
  S3_SECRET_ACCESS_KEY: "cimavia_dev_secret",
};

const TOPO = { fileName: "topo.pdf", mimeType: "application/pdf", size: 1000 };
const logger = { warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

/**
 * Le balayage des objets sans ligne en base (#72). Comptes préfixés `sweep-`, et chaque balayage
 * restreint au préfixe de ces comptes : les objets des autres domaines n'y passent pas.
 */
describe("Balayer les objets orphelins : seuls partent ceux qu'aucune ligne ne cite (#72)", () => {
  let storage: StorageService;
  let sweeper: OrphanSweepService;
  let coach: Agent;
  let coachPrefix: string;
  let athletePrefix: string;
  let attached: string;
  let invoiceDocument: string;
  let unattached: string;
  let foreign: string;

  const objectStatus = async (key: string) =>
    (await fetch(await storage.createDownloadUrl(key))).status;
  const later = () => new Date(Date.now() + ORPHAN_GRACE_MS + 60_000);
  const orphanKeys = (report: { orphans: { key: string }[] }) =>
    report.orphans.map((orphan) => orphan.key);

  beforeAll(async () => {
    storage = app.get(StorageService);
    const config = { get: (key: string) => SILO_ROOT[key] ?? process.env[key] };
    const rootStorage = new StorageService(
      config as unknown as ConfigService<EnvSchema, true>,
      logger,
    );
    sweeper = new OrphanSweepService(app.get(PrismaService), rootStorage, logger);

    coach = await signUp("sweep-coach@cmv.test", Role.COACH);
    const athlete = await signUp("sweep-athlete@cmv.test", Role.ATHLETE);
    const { athleteId } = await linkRelation(coach, athlete);
    coachPrefix = `coach/${await idOf(coach)}/`;
    athletePrefix = `athlete/${athleteId}/`;

    const exercise = await coach.post("/exercises").send({ title: "Bloc balayé" });
    expect(exercise.status).toBe(201);
    attached = await putExerciseFile(coach, exercise.body.id, TOPO);
    const document = await coach
      .post(`/exercises/${exercise.body.id}/documents`)
      .send({ type: "FILE", storagePath: attached, ...TOPO });
    expect(document.status).toBe(201);
    // Envoyé, jamais rattaché : l'orphelin de P2-1.
    unattached = await putExerciseFile(coach, exercise.body.id, TOPO);

    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle balayé",
      startDate: mondayOfCurrentWeek(),
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    await coach
      .put(`/plans/${plan.body.id}/billing`)
      .send({ amountCents: 5000, dueDate: "2026-01-05" });
    invoiceDocument = await attachInvoiceDocument(coach, plan.body.id);

    // Sous le préfixe du Coach, mais pas de la forme que l'API construit : déposé par un autre outil.
    foreign = `${coachPrefix}notes.txt`;
    const put = await fetch(await rootStorage.createUploadUrl(foreign, "text/plain"), {
      method: "PUT",
      body: "pas à nous",
      headers: { "content-type": "text/plain" },
    });
    expect(put.status).toBe(200);
  });

  it("la clé d'API ne peut pas lister le bucket : le balayage exige l'identité root", async () => {
    await expect(storage.listObjects().next()).rejects.toMatchObject({ name: "AccessDenied" });
  });

  it("ne propose rien de plus récent que la fenêtre de grâce", async () => {
    const report = await sweeper.sweep({ now: new Date(), remove: true, prefix: coachPrefix });

    expect(report).toMatchObject({ referenced: 0, orphans: [], deleted: [] });
    expect(report.recent).toBe(2);
    expect(await objectStatus(unattached)).toBe(200);
  });

  it("en simulation, rapporte l'orphelin et ne supprime rien", async () => {
    const report = await sweeper.sweep({ now: later(), remove: false, prefix: coachPrefix });

    expect(orphanKeys(report)).toEqual([unattached]);
    expect(report).toMatchObject({ scanned: 3, referenced: 1, unknown: [foreign], deleted: [] });
    expect(await objectStatus(unattached)).toBe(200);
  });

  it("supprime l'orphelin, et lui seul", async () => {
    const report = await sweeper.sweep({ now: later(), remove: true, prefix: coachPrefix });

    expect(report).toMatchObject({ deleted: [unattached], failed: [] });
    expect(await objectStatus(unattached)).toBe(404);
    expect(await objectStatus(attached)).toBe(200);
    expect(await objectStatus(foreign)).toBe(200);
  });

  it("garde le justificatif qu'une facture cite", async () => {
    const report = await sweeper.sweep({ now: later(), remove: true, prefix: athletePrefix });

    expect(report).toMatchObject({ scanned: 1, referenced: 1, orphans: [], deleted: [] });
    expect(await objectStatus(invoiceDocument)).toBe(200);
  });

  // La file de l'effacement (#256) a déjà pris l'objet en charge : le balayage ne la double pas.
  it("laisse à la file des objets à retirer ce qu'elle a déjà pris en charge", async () => {
    const prisma = app.get(PrismaService);
    await prisma.invoice.updateMany({
      where: { documentPath: invoiceDocument },
      data: {
        documentPath: null,
        documentFileName: null,
        documentMimeType: null,
        documentSizeBytes: null,
      },
    });
    await prisma.pendingObjectDeletion.create({ data: { key: invoiceDocument } });
    // Retirée quoi qu'il arrive : restée en file, un tick d'un autre domaine purgerait l'objet et
    // brouillerait le diagnostic.
    try {
      const report = await sweeper.sweep({ now: later(), remove: true, prefix: athletePrefix });

      expect(report).toMatchObject({ referenced: 1, deleted: [] });
      expect(await objectStatus(invoiceDocument)).toBe(200);
    } finally {
      await prisma.pendingObjectDeletion.deleteMany({ where: { key: invoiceDocument } });
    }
  });
});
