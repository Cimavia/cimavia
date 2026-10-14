import { AccessLevel, InvitationRole, MyAccessLevel, Role } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { type Agent, emailOf, idOf, signUp } from "../support/actors";
import { app } from "../support/app";
import { type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";
import { patchAtLatest } from "../support/version";

/**
 * Les routes des droits d'une planification (#607) : à qui C peut l'ouvrir, ce qu'il en change, et
 * l'Écriture que F reçoit par défaut quand le cycle naît pour un athlète suivi via F, ou lui est
 * affecté. TI est suivi par C et M en direct ; TF, invité par F, l'est par ses trois Coachs.
 * Comptes `plan-share-grant-`.
 */
describe("Droits d'une planification : entreprises éligibles, changement, défaut", () => {
  let world: SharedPlanWorld;
  let tf: Agent;
  let tfId: string;

  const createPlan = async (athleteId: string | null, title: string) => {
    const res = await world.c.post("/plans").send({
      athleteId,
      title,
      startDate: world.monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; grants: unknown[] };
  };
  const changeAccess = (agent: Agent, ids: string[], level: "READ" | "WRITE" | null) =>
    agent
      .patch("/plans/access")
      .send({ ids, changes: [{ organizationId: world.ids.organization, level }] });
  const levelsOf = (planId: string) =>
    app
      .get(PrismaService)
      .accessGrant.findMany({ where: { planId }, select: { level: true } })
      .then((rows) => rows.map((row) => row.level));
  const coachIdsOf = (organization: { coaches: { coachId: string }[] }) =>
    organization.coaches.map((coach) => coach.coachId).sort();

  beforeAll(async () => {
    world = await sharedPlanWorld("plan-share-grant");
    tf = await signUp("plan-share-grant-tf@cmv.test", Role.ATHLETE);
    const invited = await world.company
      .post("/organization/invitations")
      .send({ email: await emailOf(tf), role: InvitationRole.ATHLETE });
    expect(invited.status).toBe(201);
    expect((await tf.post(`/invitations/${invited.body.id}/accept`)).status).toBe(201);
    tfId = await idOf(tf);
  });

  it("F n'est éligible qu'avec ses Coachs qui suivent l'athlète", async () => {
    const forTi = await world.c.get(`/plans/${world.planTi.id}/organizations`);
    expect(forTi.status).toBe(200);
    expect(forTi.body).toHaveLength(1);
    expect(forTi.body[0].id).toBe(world.ids.organization);
    expect(coachIdsOf(forTi.body[0])).toEqual([world.ids.c, world.ids.m].sort());

    // Seul C suit TE : personne à qui l'ouvrir.
    expect((await world.c.get(`/plans/${world.planTe.id}/organizations`)).body).toEqual([]);

    // Sans athlète, le cycle se partage comme un exercice : F entière.
    const draft = await createPlan(null, "Brouillon sans athlète");
    const forDraft = (await world.c.get(`/plans/${draft.id}/organizations`)).body;
    expect(coachIdsOf(forDraft[0])).toEqual([world.ids.c, world.ids.m, world.ids.n].sort());
  });

  it("C ouvre le cycle de TI à F, pas celui de TE", async () => {
    expect((await changeAccess(world.c, [world.planTe.id], "READ")).status).toBe(400);
    expect(await levelsOf(world.planTe.id)).toEqual([]);

    const opened = await changeAccess(world.c, [world.planTi.id], "READ");
    expect(opened.status).toBe(200);
    expect(opened.body).toEqual([
      {
        id: world.planTi.id,
        grants: [
          { organization: { id: world.ids.organization, name: expect.any(String) }, level: "READ" },
        ],
      },
    ]);
    const read = await world.m.get(`/plans/${world.planTi.id}`);
    expect(read.body.myAccess).toMatchObject({ level: MyAccessLevel.READ });
  });

  it("la gestion des accès reste au propriétaire", async () => {
    await changeAccess(world.c, [world.planTi.id], "WRITE");

    expect((await world.m.get(`/plans/${world.planTi.id}/organizations`)).status).toBe(403);
    expect((await changeAccess(world.m, [world.planTi.id], "READ")).status).toBe(403);
    // N est Coach de F sans suivre TI : le cycle lui reste introuvable.
    expect((await world.n.get(`/plans/${world.planTi.id}/organizations`)).status).toBe(404);
    expect((await changeAccess(world.n, [world.planTi.id], null)).status).toBe(404);
  });

  it("« Aucun » ferme le cycle et s'écrit, que le panneau ne montre pas", async () => {
    const closed = await changeAccess(world.c, [world.planTi.id], null);
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual([{ id: world.planTi.id, grants: [] }]);
    expect(await levelsOf(world.planTi.id)).toEqual([AccessLevel.NONE]);
    expect((await world.m.get(`/plans/${world.planTi.id}`)).status).toBe(404);
  });

  it("né pour un athlète suivi via F, le cycle s'ouvre à F en Écriture", async () => {
    const forTf = await createPlan(tfId, "Cycle de TF");
    expect(forTf.grants).toEqual([
      { organization: { id: world.ids.organization, name: expect.any(String) }, level: "WRITE" },
    ]);
    const edited = await patchAtLatest(world.m, `/plans/${forTf.id}`, { title: "Revu par M" });
    expect(edited.status).toBe(200);

    // Un lien direct n'ouvre rien.
    expect((await createPlan(world.ids.ti, "Cycle direct de TI")).grants).toEqual([]);
  });

  it("affecté à TF, un brouillon s'ouvre à F — sauf si F y est fermée exprès", async () => {
    const open = await createPlan(null, "Brouillon pour TF");
    const assigned = await patchAtLatest(world.c, `/plans/${open.id}`, { athleteId: tfId });
    expect(assigned.status).toBe(200);
    expect(assigned.body.grants).toEqual([
      { organization: { id: world.ids.organization, name: expect.any(String) }, level: "WRITE" },
    ]);

    const closed = await createPlan(null, "Brouillon fermé");
    expect((await changeAccess(world.c, [closed.id], null)).status).toBe(200);
    const kept = await patchAtLatest(world.c, `/plans/${closed.id}`, { athleteId: tfId });
    expect(kept.status).toBe(200);
    expect(kept.body.grants).toEqual([]);
    expect(await levelsOf(closed.id)).toEqual([AccessLevel.NONE]);
    expect((await world.m.get(`/plans/${closed.id}`)).status).toBe(404);
  });
});
