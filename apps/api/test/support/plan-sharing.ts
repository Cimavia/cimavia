import { Role } from "@cmv/shared";
import { expect } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { type Agent, idOf, joinOrganization, link, signUp, signUpWith } from "./actors";
import { app } from "./app";
import { mondayOfCurrentWeek } from "./fixtures";
import { required } from "./required";

const COMPANY = { isCoach: false, isAthlete: false, isCompany: true };

/**
 * Le terrain d'une planification partagée (#607), celui de la phase de test multi-coach : C et M
 * sont Coachs de F et suivent TI ; C seul suit TE. N est Coach de F sans suivre TI ; B suit TI hors
 * de F. C a écrit un cycle pour chacun de ses deux athlètes.
 */
export type SharedPlanWorld = {
  /** Le compte Entreprise F : il invite, en son nom, les athlètes que ses Coachs suivront. */
  company: Agent;
  c: Agent;
  m: Agent;
  n: Agent;
  b: Agent;
  ti: Agent;
  te: Agent;
  ids: { organization: string; c: string; m: string; n: string; b: string; ti: string };
  monday: string;
  /** Le cycle de TI, en brouillon : deux semaines, une séance le lundi de la première. */
  planTi: { id: string; weekId: string; secondWeekId: string; sessionId: string };
  /** Le cycle de TE, en brouillon : une semaine. */
  planTe: { id: string; weekId: string };
};

/** Le terrain, comptes préfixés par `prefix` : chaque domaine a ses adresses. */
export async function sharedPlanWorld(prefix: string): Promise<SharedPlanWorld> {
  const company = await signUpWith(`${prefix}-f@cmv.test`, COMPANY);
  const coach = (who: string) => signUp(`${prefix}-${who}@cmv.test`, Role.COACH);
  const athlete = (who: string) => signUp(`${prefix}-${who}@cmv.test`, Role.ATHLETE);
  const [c, m, n, b, ti, te] = await Promise.all([
    coach("c"),
    coach("m"),
    coach("n"),
    coach("b"),
    athlete("ti"),
    athlete("te"),
  ]);
  for (const member of [c, m, n]) await joinOrganization(company, member);
  const tiId = await link(c, ti);
  await link(m, ti);
  await link(b, ti);
  const teId = await link(c, te);

  const monday = mondayOfCurrentWeek();
  const createPlan = async (athleteId: string, title: string, weeks: number) => {
    const res = await c.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: Array.from({ length: weeks }, () => ({ type: "TRAINING" })),
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; weeks: { id: string }[] };
  };
  const forTi = await createPlan(tiId, "Cycle de TI", 2);
  const forTe = await createPlan(teId, "Cycle de TE", 1);
  const [weekId, secondWeekId] = forTi.weeks.map((week) => week.id);
  const session = await c
    .post(`/plan-weeks/${weekId}/sessions`)
    .send({ title: "Séance de TI", scheduledDate: monday });
  expect(session.status).toBe(201);

  const [organization, cId, mId, nId, bId] = await Promise.all([
    idOf(company),
    idOf(c),
    idOf(m),
    idOf(n),
    idOf(b),
  ]);
  return {
    company,
    c,
    m,
    n,
    b,
    ti,
    te,
    ids: { organization, c: cId, m: mId, n: nId, b: bId, ti: tiId },
    monday,
    planTi: {
      id: forTi.id,
      weekId: required(weekId, "semaine 1 de TI"),
      secondWeekId: required(secondWeekId, "semaine 2 de TI"),
      sessionId: session.body.id,
    },
    planTe: { id: forTe.id, weekId: required(forTe.weeks[0]?.id, "semaine de TE") },
  };
}

/**
 * Pose le droit de l'entreprise sur un cycle, ou le retire (`null`). Écrit en base : la route qui le
 * gère arrive avec le panneau des accès, et l'isolation s'éprouve sans elle.
 */
export async function grantPlan(
  world: SharedPlanWorld,
  planId: string,
  level: "NONE" | "READ" | "WRITE" | null,
): Promise<void> {
  const prisma = app.get(PrismaService);
  const organizationId = world.ids.organization;
  await prisma.accessGrant.deleteMany({ where: { planId, organizationId } });
  if (level == null) return;
  await prisma.accessGrant.create({
    data: { ownerId: world.ids.c, planId, organizationId, level },
  });
}
