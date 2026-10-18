import { MyAccessLevel, type PlanSummaryDto } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { billAndPublish } from "../support/actors";
import { app } from "../support/app";
import { attemptPlanWrites } from "../support/intrusion";
import { grantPlan, type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";
import { asCoach } from "../support/tenant";
import { ANY_VERSION, atWeekVersion, patchAtLatest, putAtLatest } from "../support/version";

/**
 * Droits d'accès sur les planifications (#607) : C ouvre à F le cycle de TI. Un droit n'atteint que
 * les Coachs de l'athlète du cycle — M, qui suit TI ; ni N, Coach de F qui ne le suit pas, ni B, qui
 * le suit hors de F. Comptes `plan-share-`.
 */

/** L'extension seule : ce que le filtre ouvre et ferme sur l'arbre d'un cycle. */
describe("Extension tenant : un droit sur un cycle l'ouvre aux Coachs de son athlète", () => {
  let world: SharedPlanWorld;

  beforeAll(async () => {
    world = await sharedPlanWorld("plan-share-ext");
    // Une facture brouillon : elle suit son cycle, comme les semaines et les séances.
    const billed = await world.c
      .put(`/plans/${world.planTi.id}/billing`)
      .send({ amountCents: 5000, dueDate: world.monday });
    expect(billed.status).toBe(200);
  });

  const readTree = (userId: string) =>
    asCoach(userId, (db) =>
      Promise.all([
        db.plan.count({ where: { id: world.planTi.id } }),
        db.planWeek.count({ where: { planId: world.planTi.id } }),
        db.scheduledSession.count({ where: { planId: world.planTi.id } }),
        db.invoice.count({ where: { planId: world.planTi.id } }),
      ]),
    );

  it("sans droit, ou fermé exprès, M ne lit rien du cycle de C", async () => {
    await grantPlan(world, world.planTi.id, null);
    await expect(readTree(world.ids.m)).resolves.toEqual([0, 0, 0, 0]);

    await grantPlan(world, world.planTi.id, "NONE");
    await expect(readTree(world.ids.m)).resolves.toEqual([0, 0, 0, 0]);
  });

  it("en Lecture, M lit le cycle et ce qui en dépend, facture comprise, mais n'écrit rien", async () => {
    await grantPlan(world, world.planTi.id, "READ");

    await expect(readTree(world.ids.m)).resolves.toEqual([1, 2, 1, 1]);
    await expect(
      asCoach(world.ids.m, (db) =>
        db.plan.updateMany({ where: { id: world.planTi.id }, data: { title: "Lu seulement" } }),
      ),
    ).resolves.toEqual({ count: 0 });
    await expect(
      asCoach(world.ids.m, (db) =>
        db.planWeek.create({
          data: {
            planId: world.planTi.id,
            athleteId: world.ids.ti,
            weekNumber: 3,
            type: "TRAINING",
          } as never,
        }),
      ),
    ).rejects.toThrow("[tenancy] PlanWeek : son Plan est introuvable, ou fermé en écriture");
  });

  it("en Écriture, ce que M ajoute au cycle reste chez C ; supprimer le cycle lui reste fermé", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");

    const week = await asCoach(world.ids.m, (db) =>
      db.planWeek.create({
        data: {
          planId: world.planTi.id,
          athleteId: world.ids.ti,
          weekNumber: 3,
          type: "TRAINING",
        } as never,
      }),
    );
    expect(week.coachId).toBe(world.ids.c);
    await asCoach(world.ids.m, (db) => db.planWeek.delete({ where: { id: week.id } }));

    await expect(
      asCoach(world.ids.m, (db) => db.plan.deleteMany({ where: { id: world.planTi.id } })),
    ).resolves.toEqual({ count: 0 });
  });

  it("le droit n'atteint que les Coachs de l'athlète : ni N dans F, ni B hors de F", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");

    await expect(readTree(world.ids.n)).resolves.toEqual([0, 0, 0, 0]);
    await expect(readTree(world.ids.b)).resolves.toEqual([0, 0, 0, 0]);
  });

  /** « Tranché en #626 » : un filtre de relation n'est pas dans la ligne que Prisma compare. */
  it("trois findUnique simultanés sur le même cycle ne se répondent pas l'un l'autre", async () => {
    await grantPlan(world, world.planTi.id, "READ");
    const read = (userId: string) =>
      asCoach(userId, (db) => db.plan.findUnique({ where: { id: world.planTi.id } }));

    const [owner, granted, outsider] = await Promise.all([
      read(world.ids.c),
      read(world.ids.m),
      read(world.ids.n),
    ]);

    expect(owner).toMatchObject({ id: world.planTi.id, coachId: world.ids.c });
    expect(granted).toMatchObject({ id: world.planTi.id, coachId: world.ids.c });
    expect(outsider).toBeNull();
  });
});

/** Par l'API : ce que M fait du cycle que C lui ouvre, et ce qui reste à C. */
describe("Planification partagée : M suit le cycle que C écrit pour TI", () => {
  let world: SharedPlanWorld;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = app.get(PrismaService);
    world = await sharedPlanWorld("plan-share-api");
  });

  const planPath = () => `/plans/${world.planTi.id}`;
  const plansOfTi = async (agent: SharedPlanWorld["m"]) => {
    const res = await agent.get("/plans").query({ athleteId: world.ids.ti });
    expect(res.status).toBe(200);
    return (res.body as PlanSummaryDto[]).map((plan) => plan.id);
  };

  it("sans droit, ou fermé exprès, M ne voit pas le cycle de C", async () => {
    await grantPlan(world, world.planTi.id, null);
    expect((await world.m.get(planPath())).status).toBe(404);
    expect(await plansOfTi(world.m)).not.toContain(world.planTi.id);

    await grantPlan(world, world.planTi.id, "NONE");
    expect((await world.m.get(planPath())).status).toBe(404);
  });

  it("le DTO dit l'auteur du cycle et d'où vient le droit ; les droits, à C seul", async () => {
    await grantPlan(world, world.planTi.id, "READ");

    const granted = await world.m.get(planPath());
    expect(granted.status).toBe(200);
    expect(granted.body).toMatchObject({
      coachId: world.ids.c,
      myAccess: { level: MyAccessLevel.READ, via: { id: world.ids.organization } },
      grants: null,
    });
    expect(await plansOfTi(world.m)).toContain(world.planTi.id);
    expect((await world.m.get(`/scheduled-sessions/${world.planTi.sessionId}`)).status).toBe(200);

    const owned = await world.c.get(planPath());
    expect(owned.body).toMatchObject({
      myAccess: { level: MyAccessLevel.OWNER, via: null },
      grants: [{ organization: { id: world.ids.organization }, level: "READ" }],
    });
  });

  it("« Aucun » écrit sur F n'apparaît pas parmi les droits du propriétaire", async () => {
    await grantPlan(world, world.planTi.id, "NONE");
    expect((await world.c.get(planPath())).body.grants).toEqual([]);
  });

  it("en Lecture, M prend 403 sur chaque écriture du cycle, avant tout conflit de version", async () => {
    await grantPlan(world, world.planTi.id, "READ");

    const statuses = await attemptPlanWrites(world.m, {
      planId: world.planTi.id,
      weekId: world.planTi.weekId,
      sessionId: world.planTi.sessionId,
      monday: world.monday,
    });
    // La facture a ses propres gardes, éprouvées avec elle.
    const planRoutes = Object.keys(statuses).filter((route) => !route.includes("/billing"));
    expect(Object.fromEntries(planRoutes.map((route) => [route, statuses[route]]))).toEqual(
      Object.fromEntries(planRoutes.map((route) => [route, 403])),
    );
    expect((await world.c.get(planPath())).status).toBe(200);
  });

  it("en Écriture, M modifie le cycle de C, et ce qu'il ajoute reste chez C", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");

    const renamed = await patchAtLatest(world.m, planPath(), { title: "Cycle de TI, revu par M" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.myAccess).toMatchObject({ level: MyAccessLevel.WRITE });

    const added = await world.m
      .post(`/plan-weeks/${world.planTi.secondWeekId}/sessions`)
      .send({ title: "Séance de M", scheduledDate: renamed.body.weeks[1].startDate });
    expect(added.status).toBe(201);
    const edited = await putAtLatest(world.m, `/scheduled-sessions/${added.body.id}`, {
      title: "Séance de M, ajustée",
      scheduledDate: renamed.body.weeks[1].startDate,
      exercises: [],
    });
    expect(edited.status).toBe(200);
    const week = await world.m
      .patch(`/plan-weeks/${world.planTi.secondWeekId}`)
      .send(
        await atWeekVersion(world.m, world.planTi.id, world.planTi.secondWeekId, { note: "M" }),
      );
    expect(week.status).toBe(200);

    const row = await prisma.scheduledSession.findUniqueOrThrow({ where: { id: added.body.id } });
    expect(row.coachId).toBe(world.ids.c);
  });

  it("une ligne que M compose sans exercice source cite le catalogue de M, pas celui de C", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");
    const grade = await world.m
      .post("/custom-metrics")
      .send({ label: "Cotation de M", unit: null, valueType: "SCALE", scale: ["6a", "6b"] });
    expect(grade.status).toBe(201);

    const composed = await putAtLatest(world.m, `/scheduled-sessions/${world.planTi.sessionId}`, {
      title: "Séance de TI",
      scheduledDate: world.monday,
      exercises: [
        {
          title: "Voie de M",
          blocks: [
            {
              id: "blk_grade",
              label: null,
              structure: { type: "SERIES", setCount: 1, restBetweenSetsSeconds: null },
              metrics: [
                {
                  id: "col_grade",
                  source: "CUSTOM",
                  customMetricId: grade.body.id,
                  label: null,
                  collapsed: false,
                },
              ],
              rows: [{ id: "r1", values: {} }],
            },
          ],
        },
      ],
    });
    expect(composed.status).toBe(200);
    // Sans la définition, l'athlète ne lirait qu'un identifiant de colonne.
    expect(composed.body.exercises[0].customMetrics).toEqual([
      expect.objectContaining({ id: grade.body.id, label: "Cotation de M" }),
    ]);
  });

  it("même en Écriture, M ne supprime pas le cycle et ne le confie pas à un autre athlète", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");

    const removed = await world.m.delete(planPath()).query({ expectedUpdatedAt: ANY_VERSION });
    expect(removed.status).toBe(403);

    const detached = await patchAtLatest(world.m, planPath(), { athleteId: null });
    expect(detached.status).toBe(403);

    // Renvoyer le même athlète n'est pas réaffecter : le formulaire d'en-tête le renvoie tel quel.
    const same = await patchAtLatest(world.m, planPath(), {
      athleteId: world.ids.ti,
      description: "Même destinataire",
    });
    expect(same.status).toBe(200);
  });

  it("N, de F sans suivre TI, et B, qui le suit hors de F, ne voient rien", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");

    expect((await world.n.get(planPath())).status).toBe(404);
    expect((await world.b.get(planPath())).status).toBe(404);
    expect(await plansOfTi(world.b)).not.toContain(world.planTi.id);
  });

  it("le cycle de TE reste fermé à M, même ouvert à F : M ne suit pas TE", async () => {
    await grantPlan(world, world.planTe.id, "WRITE");

    expect((await world.m.get(`/plans/${world.planTe.id}`)).status).toBe(404);
    expect((await world.m.get("/plans")).body.map((plan: { id: string }) => plan.id)).not.toContain(
      world.planTe.id,
    );
  });

  it("M colle dans son propre cycle une semaine du cycle de C qu'il lit", async () => {
    await grantPlan(world, world.planTi.id, "READ");
    const mine = await world.m.post("/plans").send({
      athleteId: world.ids.ti,
      title: "Cycle de M pour TI",
      startDate: world.monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(mine.status).toBe(201);
    const target = mine.body.weeks[0].id;

    const copied = await world.m.post(`/plan-weeks/${target}/copy-from`).send(
      await atWeekVersion(world.m, mine.body.id, target, {
        sourcePlanWeekId: world.planTi.weekId,
      }),
    );
    expect(copied.status).toBe(201);
    expect(copied.body.weeks[0].sessions).toHaveLength(1);
    expect(copied.body.myAccess).toEqual({ level: MyAccessLevel.OWNER, via: null });
  });

  it("TI ne voit du cycle partagé que sa diffusion, sans droit d'accès", async () => {
    await grantPlan(world, world.planTi.id, "WRITE");
    const before = await world.ti.get("/me/plans");
    expect(before.body.map((plan: { id: string }) => plan.id)).not.toContain(world.planTi.id);

    expect((await billAndPublish(world.c, world.planTi.id)).status).toBe(200);

    const after = await world.ti.get("/me/plans");
    expect(after.body.find((plan: { id: string }) => plan.id === world.planTi.id)).toMatchObject({
      coachId: world.ids.c,
      myAccess: null,
      grants: null,
    });
  });
});
