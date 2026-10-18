import { InvitationRole, Role } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Agent,
  billAndPublish,
  inviteFor,
  linkRelation,
  required,
  signUp,
  signUpWith,
} from "../support/actors";
import { inPast, mondayOfCurrentWeek } from "../support/fixtures";
import { countQueries } from "../support/query-count";

/**
 * Le nombre de requêtes SQL des routes de liste (#629) : celles qui grandissent avec le nombre
 * d'athlètes, de Coachs ou de membres. Chaque route est mesurée sur un petit jeu, puis sur un plus
 * grand, et doit émettre EXACTEMENT son budget les deux fois.
 *
 * - **Le même chiffre sur les deux jeux** : une requête par élément (N+1) le ferait grandir.
 * - **Le chiffre exact, sans marge** : une requête ajoutée exprès se déclare en changeant le
 *   budget, dans la PR qui l'ajoute et sous les yeux de qui la relit. Une marge l'aurait laissée
 *   passer sans que personne la voie.
 *
 * Le budget compte TOUT ce que la route émet, la lecture de session de Better Auth comprise, hors
 * ordres de transaction (`support/query-count.ts`). Comptes préfixés `qb-`.
 */

type Budget = Record<string, number>;

const monday = mondayOfCurrentWeek();

/**
 * Le suivi complet d'un athlète par un Coach : un cycle diffusé et facturé, une séance débriefée,
 * un fil avec un message non lu, un rappel dû — une ligne dans chaque liste que le Coach lit.
 */
async function follow(coach: Agent, athlete: Agent): Promise<void> {
  const { athleteId, coachId } = await linkRelation(coach, athlete);

  const plan = await coach.post("/plans").send({
    athleteId,
    title: "Cycle mesuré",
    startDate: monday,
    weeks: [{ type: "TRAINING" }],
  });
  expect(plan.status).toBe(201);
  const session = await coach
    .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
    .send({ title: "Séance mesurée", scheduledDate: monday });
  expect(session.status).toBe(201);
  expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);

  const debrief = await athlete
    .put(`/me/scheduled-sessions/${session.body.id}/feedback`)
    .send({ content: "Faite" });
  expect(debrief.status).toBe(200);

  const thread = await athlete.post("/conversations").send({ coachId });
  const message = await athlete
    .post(`/conversations/${thread.body.id}/messages`)
    .send({ type: "TEXT", content: "Bonjour" });
  expect(message.status).toBe(201);

  const reminder = await coach
    .post("/reminders")
    .send({ entityType: "PLAN", entityId: plan.body.id, dueAt: inPast(1), note: "Relancer" });
  expect(reminder.status).toBe(201);
}

type Reading = { queries: number; body: unknown };

/**
 * Chaque route est lue une première fois sans compter : ce qui traînerait encore du jeu de données
 * (une écriture qui finit après sa réponse) tombe sur cet appel, pas sur la mesure.
 */
async function measure(agent: Agent, routes: readonly string[]): Promise<Record<string, Reading>> {
  const readings: Record<string, Reading> = {};
  for (const route of routes) {
    await agent.get(route);
    let body: unknown;
    const queries = await countQueries(async () => {
      const res = await agent.get(route);
      expect(res.status, route).toBe(200);
      body = res.body;
    });
    readings[route] = { queries, body };
  }
  return readings;
}

/**
 * Un test par route du budget : `seed` monte le petit jeu et rend le lecteur, `grow` l'agrandit.
 * Les deux mesures sont prises une fois, dans le `beforeAll` du bloc appelant.
 */
function expectBudget(
  budget: Budget,
  seed: () => Promise<{ reader: Agent; grow: () => Promise<void> }>,
): void {
  const routes = Object.keys(budget);
  let few: Record<string, Reading>;
  let many: Record<string, Reading>;

  beforeAll(async () => {
    const { reader, grow } = await seed();
    few = await measure(reader, routes);
    await grow();
    many = await measure(reader, routes);
  });

  it.each(routes)("%s", (route) => {
    const small = required(few[route], route);
    const large = required(many[route], route);
    // Le grand jeu doit avoir nourri la route : une liste restée vide ne mesure aucun N+1.
    if (Array.isArray(small.body) && Array.isArray(large.body)) {
      expect(large.body.length, route).toBeGreaterThan(small.body.length);
    } else {
      expect(large.body, route).not.toEqual(small.body);
    }
    expect({ petit: small.queries, grand: large.queries }).toEqual({
      petit: budget[route],
      grand: budget[route],
    });
  });
}

describe("Requêtes SQL des listes du Coach : 1 athlète puis 4 (#629)", () => {
  expectBudget(
    {
      "/athletes": 4,
      // +4 (#607) : le droit du Coach sur chaque cycle — ses entreprises, puis les lignes d'accès,
      // leur entreprise et son nom. Un lot par relation, pas une requête par cycle. +1 (#608) : le
      // Coach de chaque ligne, qui peut l'emporter sur son entreprise.
      "/plans": 10,
      "/feedbacks": 6,
      // +5 (#607) : le même droit, lu sur le cycle de chaque facture — et son propriétaire.
      // +1 (#608) : le Coach de chaque ligne.
      "/invoices": 11,
      "/conversations": 6,
      "/reminders": 5,
      "/reminders/summary": 4,
      "/me/notifications": 4,
      "/me/notifications/unread-count": 5,
      "/invitations": 3,
    },
    async () => {
      const coach = await signUp("qb-coach@cmv.test", Role.COACH);
      const followAnother = async (tag: string) => {
        await follow(coach, await signUp(`qb-coach-athlete-${tag}@cmv.test`, Role.ATHLETE));
        // Une invitation restée en attente : la liste `/invitations` les montre aussi.
        const pending = await coach
          .post("/invitations")
          .send({ email: `qb-coach-pending-${tag}@cmv.test` });
        expect(pending.status).toBe(201);
      };
      await followAnother("1");
      return {
        reader: coach,
        grow: async () => {
          for (const tag of ["2", "3", "4"]) await followAnother(tag);
        },
      };
    },
  );
});

describe("Requêtes SQL des listes de l'athlète : 1 Coach puis 4 (#629)", () => {
  expectBudget(
    {
      "/me/plans": 10,
      "/me/coaches": 4,
      "/invitations/for-me": 5,
      "/invoices": 5,
      "/conversations": 6,
      "/me/notifications": 3,
    },
    async () => {
      const athlete = await signUp("qb-athlete@cmv.test", Role.ATHLETE);
      const followedBy = async (tag: string) => {
        await follow(await signUp(`qb-athlete-coach-${tag}@cmv.test`, Role.COACH), athlete);
        // Une invitation d'un autre Coach, pas encore acceptée : `/invitations/for-me` la montre.
        const pending = await signUp(`qb-athlete-pending-${tag}@cmv.test`, Role.COACH);
        expect((await inviteFor(pending, athlete)).status).toBe(201);
      };
      await followedBy("1");
      return {
        reader: athlete,
        grow: async () => {
          for (const tag of ["2", "3", "4"]) await followedBy(tag);
        },
      };
    },
  );
});

describe("Requêtes SQL des listes de l'entreprise : 1 Coach et 1 athlète, puis 3 et 4 (#629)", () => {
  const COACH = { isCoach: true, isAthlete: false };
  const ATHLETE = { isCoach: false, isAthlete: true };

  async function invite(company: Agent, email: string, role: InvitationRole): Promise<string> {
    const res = await company.post("/organization/invitations").send({ email, role });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  expectBudget(
    {
      "/organization/coaches": 4,
      "/organization/athletes": 5,
      "/organization/invitations?role=COACH": 3,
      "/organization/invitations?role=ATHLETE": 3,
    },
    async () => {
      const company = await signUpWith("qb-company@cmv.test", {
        isCoach: false,
        isAthlete: false,
        isCompany: true,
      });
      const join = async (tag: string) => {
        const email = `qb-company-coach-${tag}@cmv.test`;
        const coach = await signUpWith(email, COACH);
        const id = await invite(company, email, InvitationRole.COACH);
        expect((await coach.post(`/organization-invitations/${id}/accept`)).status).toBe(204);
      };
      const enrol = async (tag: string) => {
        const email = `qb-company-athlete-${tag}@cmv.test`;
        const athlete = await signUpWith(email, ATHLETE);
        const id = await invite(company, email, InvitationRole.ATHLETE);
        expect((await athlete.post(`/invitations/${id}/accept`)).status).toBe(201);
        // Les deux listes d'invitations montrent aussi celles en attente.
        await invite(company, `qb-company-pending-coach-${tag}@cmv.test`, InvitationRole.COACH);
        await invite(company, `qb-company-pending-ath-${tag}@cmv.test`, InvitationRole.ATHLETE);
      };
      await join("1");
      await enrol("1");
      return {
        reader: company,
        grow: async () => {
          for (const tag of ["2", "3"]) await join(tag);
          for (const tag of ["2", "3", "4"]) await enrol(tag);
        },
      };
    },
  );
});
