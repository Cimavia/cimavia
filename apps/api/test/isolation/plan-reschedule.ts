import { NotificationType, PLAN_MAX_WEEKS, Role, shiftIsoDate } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { type Agent, billAndPublish, link, required, signUp } from "../support/actors";
import { app } from "../support/app";
import { fromTemplate, mondayOfCurrentWeek } from "../support/fixtures";
import { atWeekVersion, expectLocked, patchAtLatest } from "../support/version";

/**
 * Décaler un cycle DIFFUSÉ (#231) : le reporter en entier, ou insérer une semaine devant la suite.
 * Une règle pour les deux — une séance faite ne bouge plus —, et l'athlète prévenu de chacun.
 */
describe("Cycle diffusé : report et semaine insérée (#231)", () => {
  let coach: Agent;
  let athlete: Agent;
  let athleteId: string;

  const monday = mondayOfCurrentWeek();
  const day = (offset: number) =>
    required(shiftIsoDate(monday, offset) ?? undefined, `J+${offset}`);

  type Notif = { type: string; entityId: string; subjectLabel: string | null };
  const rescheduledFor = async (planId: string): Promise<Notif[]> =>
    ((await athlete.get("/me/notifications")).body as Notif[]).filter(
      (n) => n.type === NotificationType.PLAN_RESCHEDULED && n.entityId === planId,
    );

  beforeAll(async () => {
    coach = await signUp("reschedule-coach@cmv.test", Role.COACH);
    athlete = await signUp("reschedule-athlete@cmv.test", Role.ATHLETE);
    athleteId = await link(coach, athlete);
  });

  /** Un cycle de trois semaines, une séance le lundi de chacune ; diffusé si demandé. */
  async function cycle(title: string, { publish = true } = {}) {
    const created = await coach.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }, { type: "DELOAD" }],
    });
    expect(created.status).toBe(201);
    const weekIds: string[] = created.body.weeks.map((w: { id: string }) => w.id);
    const sessionIds: string[] = [];
    for (const [index, weekId] of weekIds.entries()) {
      const session = await coach
        .post(`/plan-weeks/${weekId}/sessions`)
        .send(await fromTemplate(coach, { title: `S${index + 1}`, scheduledDate: day(7 * index) }));
      expect(session.status).toBe(201);
      sessionIds.push(session.body.id);
    }
    const planId: string = created.body.id;
    if (publish) expect((await billAndPublish(coach, planId)).status).toBe(200);
    return { planId, weekIds, sessionIds };
  }

  const datesOf = async (planId: string) =>
    (await coach.get(`/plans/${planId}`)).body.weeks.map(
      (w: { weekNumber: number; sessions: { scheduledDate: string }[] }) => [
        w.weekNumber,
        w.sessions.map((s) => s.scheduledDate),
      ],
    );

  /** Le cycle tel que l'athlète le lit, dans son planning. */
  const athletePlan = async (planId: string) =>
    (
      (await athlete.get("/me/plans")).body as { id: string; startDate: string; weeks: unknown[] }[]
    ).find((plan) => plan.id === planId);

  const debrief = (sessionId: string) =>
    athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({ content: "Faite." });

  describe("reporter le cycle entier", () => {
    it("reporte un cycle que rien n'a touché : toutes ses séances suivent, l'athlète est prévenu", async () => {
      const { planId } = await cycle("Report entier");

      const res = await patchAtLatest(coach, `/plans/${planId}`, { startDate: day(14) });

      expect(res.status).toBe(200);
      expect(res.body.startDate).toBe(day(14));
      expect(await datesOf(planId)).toEqual([
        [1, [day(14)]],
        [2, [day(21)]],
        [3, [day(28)]],
      ]);
      expect(await rescheduledFor(planId)).toEqual([
        expect.objectContaining({ subjectLabel: "Report entier" }),
      ]);
      // L'athlète lit les nouvelles dates : son planning n'a rien d'autre à relire.
      expect((await athletePlan(planId))?.startDate).toBe(day(14));
    });

    it("refuse d'avancer un cycle diffusé (409), sans rien écrire ni prévenir", async () => {
      const { planId } = await cycle("Report arrière");

      expectLocked(await patchAtLatest(coach, `/plans/${planId}`, { startDate: day(-7) }));

      expect(await datesOf(planId)).toEqual([
        [1, [day(0)]],
        [2, [day(7)]],
        [3, [day(14)]],
      ]);
      expect(await rescheduledFor(planId)).toEqual([]);
    });

    it("refuse de reporter en entier un cycle dont une séance est faite (409)", async () => {
      const { planId, sessionIds } = await cycle("Déjà commencé");
      expect((await debrief(required(sessionIds[0], "S1"))).status).toBe(200);

      expectLocked(await patchAtLatest(coach, `/plans/${planId}`, { startDate: day(7) }));

      expect((await coach.get(`/plans/${planId}`)).body.startDate).toBe(monday);
      expect(await rescheduledFor(planId)).toEqual([]);
    });

    it("un brouillon s'avance comme il se reporte, sans notification", async () => {
      const { planId } = await cycle("Brouillon mobile", { publish: false });

      expect((await patchAtLatest(coach, `/plans/${planId}`, { startDate: day(-7) })).status).toBe(
        200,
      );
      expect(await rescheduledFor(planId)).toEqual([]);
    });
  });

  describe("insérer une semaine", () => {
    const insert = async (planId: string, weekId: string) =>
      coach
        .post(`/plan-weeks/${weekId}/insert-before`)
        .send(await atWeekVersion(coach, planId, weekId, { type: "DELOAD", note: "Blessure" }));

    it("insère avant la semaine 2 : la suite glisse d'une semaine, la semaine faite reste", async () => {
      const { planId, weekIds, sessionIds } = await cycle("Athlète blessé");
      expect((await debrief(required(sessionIds[0], "S1"))).status).toBe(200);

      const res = await insert(planId, required(weekIds[1], "semaine 2"));

      expect(res.status).toBe(201);
      expect(
        res.body.weeks.map((w: { weekNumber: number; type: string; note: string | null }) => [
          w.weekNumber,
          w.type,
          w.note,
        ]),
      ).toEqual([
        [1, "TRAINING", null],
        [2, "DELOAD", "Blessure"],
        [3, "TRAINING", null],
        [4, "DELOAD", null],
      ]);
      expect(await datesOf(planId)).toEqual([
        [1, [day(0)]],
        [2, []],
        [3, [day(14)]],
        [4, [day(21)]],
      ]);
      expect(await rescheduledFor(planId)).toEqual([
        expect.objectContaining({ subjectLabel: "Athlète blessé" }),
      ]);
    });

    it("la semaine insérée appartient à l'athlète du cycle : il la lit", async () => {
      const { planId, weekIds } = await cycle("Lue par l'athlète");
      expect((await insert(planId, required(weekIds[0], "semaine 1"))).status).toBe(201);

      expect((await athletePlan(planId))?.weeks).toHaveLength(4);
    });

    it("refuse d'insérer devant une semaine faite (409), sans rien renuméroter", async () => {
      const { planId, weekIds, sessionIds } = await cycle("Semaine faite");
      expect((await debrief(required(sessionIds[1], "S2"))).status).toBe(200);

      expectLocked(await insert(planId, required(weekIds[0], "semaine 1")));
      expectLocked(await insert(planId, required(weekIds[1], "semaine 2")));

      expect(await datesOf(planId)).toEqual([
        [1, [day(0)]],
        [2, [day(7)]],
        [3, [day(14)]],
      ]);
      expect(await rescheduledFor(planId)).toEqual([]);
      // Après la semaine faite, la suite glisse encore.
      expect((await insert(planId, required(weekIds[2], "semaine 3"))).status).toBe(201);
    });

    it("insère aussi dans un brouillon, sans notification", async () => {
      const { planId, weekIds } = await cycle("Brouillon inséré", { publish: false });

      expect((await insert(planId, required(weekIds[0], "semaine 1"))).status).toBe(201);
      expect(await datesOf(planId)).toEqual([
        [1, []],
        [2, [day(7)]],
        [3, [day(14)]],
        [4, [day(21)]],
      ]);
      expect(await rescheduledFor(planId)).toEqual([]);
    });

    it("refuse sur une version périmée de la semaine, sans rien écrire", async () => {
      const { planId, weekIds } = await cycle("Version périmée");
      const weekId = required(weekIds[1], "semaine 2");
      const read = await atWeekVersion(coach, planId, weekId, { type: "TRAINING" });
      expect(
        (await coach.patch(`/plan-weeks/${weekId}`).send({ ...read, note: "Retouchée" })).status,
      ).toBe(200);

      const stale = await coach.post(`/plan-weeks/${weekId}/insert-before`).send(read);

      expect(stale.status).toBe(409);
      expect((await coach.get(`/plans/${planId}`)).body.weeks).toHaveLength(3);
    });

    it(`refuse au-delà de ${PLAN_MAX_WEEKS} semaines`, async () => {
      const { planId, weekIds } = await cycle("Plein", { publish: false });
      const prisma = app.get(PrismaService);
      const coachId = required(
        (await prisma.plan.findUnique({ where: { id: planId } }))?.coachId,
        "propriétaire",
      );
      await prisma.planWeek.createMany({
        data: Array.from({ length: PLAN_MAX_WEEKS - 3 }, (_, index) => ({
          planId,
          coachId,
          athleteId,
          weekNumber: 4 + index,
          type: "TRAINING" as const,
        })),
      });

      const res = await insert(planId, required(weekIds[0], "semaine 1"));

      expect(res.status).toBe(400);
      expect((await coach.get(`/plans/${planId}`)).body.weeks).toHaveLength(PLAN_MAX_WEEKS);
    });
  });
});
