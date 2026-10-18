import {
  type AccessGrantDto,
  AccessLevel,
  type CoachGrantDto,
  effectiveAccess,
  MyAccessLevel,
  Role,
} from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { type Agent, idOf, joinOrganization, signUp, signUpWith } from "../support/actors";
import { app } from "../support/app";
import { type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";
import { asCoach } from "../support/tenant";
import { patchAtLatest } from "../support/version";

/**
 * La ligne d'un Coach, prioritaire sur celle de son entreprise (#608). C, M et N sont Coachs de F ;
 * C et M le sont aussi de G ; B n'est d'aucune. Comptes `coach-grant-`.
 */

const COMPANY = { isCoach: false, isAthlete: false, isCompany: true };

type Level = "NONE" | "READ" | "WRITE";
type OrganizationLevel = "READ" | "WRITE" | null;

/**
 * Le filtre de l'extension et `effectiveAccess` disent la même règle (#608) : sur chaque cas de la
 * table — F, G et la ligne de M —, ce que M lit et écrit par la base doit être ce que la fonction
 * pure lui accorde. Un écart entre les deux ferait lever `toAccessView` (500), ou ouvrirait ce que
 * le DTO dit fermé.
 */
describe("Extension tenant : la ligne d'un Coach l'emporte sur ses entreprises", () => {
  let prisma: PrismaService;
  let cId: string;
  let mId: string;
  let fId: string;
  let gId: string;
  let exerciseId: string;

  beforeAll(async () => {
    prisma = app.get(PrismaService);
    const [f, g] = await Promise.all([
      signUpWith("coach-grant-ext-f@cmv.test", COMPANY),
      signUpWith("coach-grant-ext-g@cmv.test", COMPANY),
    ]);
    const c = await signUp("coach-grant-ext-c@cmv.test", Role.COACH);
    const m = await signUp("coach-grant-ext-m@cmv.test", Role.COACH);
    for (const company of [f, g]) {
      await joinOrganization(company, c);
      await joinOrganization(company, m);
    }
    [fId, gId, cId, mId] = await Promise.all([idOf(f), idOf(g), idOf(c), idOf(m)]);
    const exercise = await c.post("/exercises").send({ title: "Traction" });
    expect(exercise.status).toBe(201);
    exerciseId = exercise.body.id;
  });

  const organizationLevels: OrganizationLevel[] = [null, "READ", "WRITE"];
  const lineLevels: (Level | null)[] = [null, "NONE", "READ", "WRITE"];
  const cases = organizationLevels.flatMap((f) =>
    organizationLevels.flatMap((g) => lineLevels.map((line) => [f, g, line] as const)),
  );

  it.each(cases)("F %s, G %s, ligne de M %s", async (f, g, line) => {
    await prisma.accessGrant.deleteMany({ where: { exerciseId } });
    const organizationRows = [
      [fId, f],
      [gId, g],
    ].flatMap(([organizationId, level]) =>
      level == null ? [] : [{ ownerId: cId, exerciseId, organizationId, level }],
    );
    const coachRows = line == null ? [] : [{ ownerId: cId, exerciseId, coachId: mId, level: line }];
    await prisma.accessGrant.createMany({
      data: [...organizationRows, ...coachRows] as never,
    });

    const grants: AccessGrantDto[] = organizationRows.map((row) => ({
      organization: { id: row.organizationId as string, name: row.organizationId as string },
      level: row.level as "READ" | "WRITE",
    }));
    const coachGrants: CoachGrantDto[] =
      line == null ? [] : [{ coach: { id: mId, name: "M" }, level: line }];
    const expected = effectiveAccess({
      ownerId: cId,
      actorId: mId,
      grants,
      coachGrants,
      actorOrganizationIds: new Set([fId, gId]),
    });

    const read = await asCoach(mId, (db) => db.exercise.findFirst({ where: { id: exerciseId } }));
    expect(read != null).toBe(expected != null);
    const written = await asCoach(mId, (db) =>
      db.exercise.updateMany({ where: { id: exerciseId }, data: { title: "Traction" } }),
    );
    expect(written.count === 1).toBe(expected?.level === MyAccessLevel.WRITE);
  });
});

describe("Droits d'accès par Coach, dans la bibliothèque", () => {
  let c: Agent;
  let m: Agent;
  let n: Agent;
  let b: Agent;
  let ids: { c: string; m: string; b: string; f: string; g: string };

  const changeAccess = (agent: Agent, kind: "exercises" | "sessions", body: object) =>
    agent.patch(`/${kind}/access`).send(body);
  const create = async (title: string) => {
    const res = await c.post("/exercises").send({ title });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    const [f, g] = await Promise.all([
      signUpWith("coach-grant-f@cmv.test", COMPANY),
      signUpWith("coach-grant-g@cmv.test", COMPANY),
    ]);
    c = await signUp("coach-grant-c@cmv.test", Role.COACH);
    m = await signUp("coach-grant-m@cmv.test", Role.COACH);
    n = await signUp("coach-grant-n@cmv.test", Role.COACH);
    b = await signUp("coach-grant-b@cmv.test", Role.COACH);
    for (const coach of [c, m, n]) await joinOrganization(f, coach);
    for (const coach of [c, m]) await joinOrganization(g, coach);
    const [fId, gId, cId, mId, bId] = await Promise.all([f, g, c, m, b].map(idOf));
    ids = {
      f: fId as string,
      g: gId as string,
      c: cId as string,
      m: mId as string,
      b: bId as string,
    };
  });

  it("F en Écriture et M à « Aucun » : M ne voit rien, N écrit", async () => {
    const id = await create("Pan Güllich");
    const res = await changeAccess(c, "exercises", {
      ids: [id],
      changes: [{ organizationId: ids.f, level: "WRITE" }],
      coachChanges: [{ coachId: ids.m, level: "NONE" }],
    });
    expect(res.status).toBe(200);
    expect(res.body[0].coachGrants).toEqual([
      { coach: { id: ids.m, name: "coach-grant-m@cmv.test" }, level: "NONE" },
    ]);

    expect((await m.get(`/exercises/${id}`)).status).toBe(404);
    const listed = (await m.get("/exercises")).body as { id: string }[];
    expect(listed.map((row) => row.id)).not.toContain(id);
    expect((await n.get(`/exercises/${id}`)).body.myAccess).toEqual({
      level: MyAccessLevel.WRITE,
      via: { id: ids.f, name: "coach-grant-f@cmv.test" },
    });
  });

  it("F en Lecture et M en Écriture : M modifie, N reste en Lecture", async () => {
    const id = await create("Campus");
    const res = await changeAccess(c, "exercises", {
      ids: [id],
      changes: [{ organizationId: ids.f, level: "READ" }],
      coachChanges: [{ coachId: ids.m, level: "WRITE" }],
    });
    expect(res.status).toBe(200);

    const asM = await m.get(`/exercises/${id}`);
    expect(asM.body).toMatchObject({ myAccess: { level: "WRITE", via: null }, coachGrants: null });
    expect((await patchAtLatest(m, `/exercises/${id}`, { title: "Campus de M" })).status).toBe(200);
    expect((await patchAtLatest(n, `/exercises/${id}`, { title: "Campus de N" })).status).toBe(403);

    // Le propriétaire lit les deux sortes de lignes ; « Hérité » rend M à F.
    expect((await c.get(`/exercises/${id}`)).body.coachGrants).toEqual([
      { coach: { id: ids.m, name: "coach-grant-m@cmv.test" }, level: "WRITE" },
    ]);
    await changeAccess(c, "exercises", {
      ids: [id],
      coachChanges: [{ coachId: ids.m, level: null }],
    });
    expect((await m.get(`/exercises/${id}`)).body.myAccess.level).toBe(MyAccessLevel.READ);
  });

  it("un Coach de deux entreprises hérite du droit le plus large", async () => {
    const id = await create("Poutre");
    await changeAccess(c, "exercises", {
      ids: [id],
      changes: [
        { organizationId: ids.f, level: "READ" },
        { organizationId: ids.g, level: "WRITE" },
      ],
    });
    expect((await m.get(`/exercises/${id}`)).body.myAccess).toEqual({
      level: MyAccessLevel.WRITE,
      via: { id: ids.g, name: "coach-grant-g@cmv.test" },
    });
  });

  it("la ligne ne se pose que pour un Coach de ses entreprises, autre que soi", async () => {
    const id = await create("Dalle");
    for (const coachId of [ids.b, ids.c, "inconnu"]) {
      for (const level of ["NONE", "READ"]) {
        const res = await changeAccess(c, "exercises", {
          ids: [id],
          coachChanges: [{ coachId, level }],
        });
        expect(res.status).toBe(400);
      }
    }
    // Rendre la main aux entreprises (« Hérité ») ne pose rien : toujours permis.
    expect(
      (
        await changeAccess(c, "exercises", {
          ids: [id],
          coachChanges: [{ coachId: ids.b, level: null }],
        })
      ).status,
    ).toBe(200);
    // M ne règle pas les accès de C, même ceux qui le visent.
    await changeAccess(c, "exercises", {
      ids: [id],
      coachChanges: [{ coachId: ids.m, level: "WRITE" }],
    });
    expect(
      (
        await changeAccess(m, "exercises", {
          ids: [id],
          coachChanges: [{ coachId: ids.m, level: null }],
        })
      ).status,
    ).toBe(403);
  });

  it("une ligne de M en Lecture le protège du retrait de F ; fermée, sa séance garde une copie", async () => {
    const id = await create("Mono-doigt");
    await changeAccess(c, "exercises", {
      ids: [id],
      changes: [{ organizationId: ids.f, level: "READ" }],
    });
    const session = await m
      .post("/sessions")
      .send({ title: "Séance de M", exercises: [{ exerciseId: id }] });
    expect(session.status).toBe(201);
    const citedBy = async () =>
      (await m.get(`/sessions/${session.body.id}`)).body.exercises[0].exerciseId;

    // Une ligne de M qui garde la Lecture le protège du retrait de F : rien à copier.
    const kept = await changeAccess(c, "exercises", {
      ids: [id],
      changes: [{ organizationId: ids.f, level: null }],
      coachChanges: [{ coachId: ids.m, level: "READ" }],
    });
    expect(kept.status).toBe(200);
    expect(await citedBy()).toBe(id);

    // Fermée à « Aucun », elle le prive : sa séance cite désormais sa copie figée (#609).
    const closed = await changeAccess(c, "exercises", {
      ids: [id],
      coachChanges: [{ coachId: ids.m, level: "NONE" }],
    });
    expect(closed.status).toBe(200);
    const copyId = await citedBy();
    expect(copyId).not.toBe(id);
    expect((await m.get(`/exercises/${copyId}`)).body.owner.id).toBe(ids.m);
  });

  it("une séance s'ouvre aussi à un seul Coach", async () => {
    const session = await c.post("/sessions").send({ title: "Séance de C", exercises: [] });
    expect(session.status).toBe(201);
    const res = await changeAccess(c, "sessions", {
      ids: [session.body.id],
      coachChanges: [{ coachId: ids.m, level: "READ" }],
    });
    expect(res.status).toBe(200);
    expect((await m.get(`/sessions/${session.body.id}`)).body.myAccess).toEqual({
      level: MyAccessLevel.READ,
      via: null,
    });
    expect((await n.get(`/sessions/${session.body.id}`)).status).toBe(404);
  });
});

/**
 * Sur un cycle, la ligne d'un Coach ne vaut que pour un Coach de l'athlète (#607, #608). TI est
 * suivi par C, M et B (hors de F) ; N, Coach de F, ne le suit pas.
 */
describe("Droits d'accès par Coach, sur une planification", () => {
  let world: SharedPlanWorld;

  const changeAccess = (body: object) => world.c.patch("/plans/access").send(body);
  const levelsOf = (planId: string) =>
    app
      .get(PrismaService)
      .accessGrant.findMany({ where: { planId, coachId: { not: null } }, select: { level: true } })
      .then((rows) => rows.map((row) => row.level));
  const createPlan = async (athleteId: string | null, title: string) => {
    const res = await world.c.post("/plans").send({
      athleteId,
      title,
      startDate: world.monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    world = await sharedPlanWorld("coach-grant-plan");
  });

  it("F en Écriture et M à « Aucun » : M ne voit plus le cycle de TI", async () => {
    const res = await changeAccess({
      ids: [world.planTi.id],
      changes: [{ organizationId: world.ids.organization, level: "WRITE" }],
      coachChanges: [{ coachId: world.ids.m, level: "NONE" }],
    });
    expect(res.status).toBe(200);
    expect((await world.m.get(`/plans/${world.planTi.id}`)).status).toBe(404);
  });

  it("F en Lecture et M en Écriture : M modifie le cycle", async () => {
    await changeAccess({
      ids: [world.planTi.id],
      changes: [{ organizationId: world.ids.organization, level: "READ" }],
      coachChanges: [{ coachId: world.ids.m, level: "WRITE" }],
    });
    const edited = await patchAtLatest(world.m, `/plans/${world.planTi.id}`, {
      title: "Revu par M",
    });
    expect(edited.status).toBe(200);
    expect(edited.body.myAccess).toEqual({ level: MyAccessLevel.WRITE, via: null });
  });

  it("ouvrir à un Coach qui ne suit pas l'athlète, ou hors de ses entreprises, est refusé", async () => {
    for (const coachId of [world.ids.n, world.ids.b]) {
      const res = await changeAccess({
        ids: [world.planTi.id],
        coachChanges: [{ coachId, level: "READ" }],
      });
      expect(res.status).toBe(400);
    }
    // Fermer N, qui est de F, n'ouvre rien : permis, même s'il ne suit pas TI.
    const closed = await changeAccess({
      ids: [world.planTi.id],
      coachChanges: [{ coachId: world.ids.n, level: "NONE" }],
    });
    expect(closed.status).toBe(200);
  });

  it("sans athlète, le cycle s'ouvre à tout Coach de ses entreprises", async () => {
    const draft = await createPlan(null, "Brouillon pour N");
    const res = await changeAccess({
      ids: [draft],
      coachChanges: [{ coachId: world.ids.n, level: "READ" }],
    });
    expect(res.status).toBe(200);
    expect((await world.n.get(`/plans/${draft}`)).status).toBe(200);
  });

  it("réaffecté, le cycle perd ses lignes ouvertes de Coach — « Aucun » reste", async () => {
    const plan = await createPlan(world.ids.ti, "Cycle de TI confié ailleurs");
    await changeAccess({
      ids: [plan],
      coachChanges: [
        { coachId: world.ids.m, level: "WRITE" },
        { coachId: world.ids.n, level: AccessLevel.NONE },
      ],
    });
    const teId = (await world.c.get(`/plans/${world.planTe.id}`)).body.athleteId;
    const moved = await patchAtLatest(world.c, `/plans/${plan}`, { athleteId: teId });
    expect(moved.status).toBe(200);
    expect(await levelsOf(plan)).toEqual([AccessLevel.NONE]);
  });
});
