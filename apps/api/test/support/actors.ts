import { Role } from "@cmv/shared";
import request from "supertest";
import { expect } from "vitest";
import { baseURL } from "./app";
import { required } from "./required";
import { publishAtLatest } from "./version";

export const PASSWORD = "password123";

export type Agent = ReturnType<typeof request.agent>;

// Dans son module : `version.ts` s'en sert, et `actors.ts` importe `version.ts`.
export { required } from "./required";

/**
 * Inscrit un compte en envoyant ses CAPACITÉS — ce que le signup transmet depuis #12, `role` en
 * étant déduit côté API. La signature reste par rôle pour les quelque cent appels de la suite :
 * « un coach », « un athlète » dit mieux l'intention du test que deux booléens.
 */
export async function signUp(email: string, role: string): Promise<Agent> {
  return signUpWith(email, { isCoach: role === Role.COACH, isAthlete: role === Role.ATHLETE });
}

/**
 * Inscription à capacités explicites — le seul moyen d'obtenir un compte qui CUMULE, ou une
 * entreprise. `name = email` : le nom d'un compte s'y lit comme son adresse.
 */
export async function signUpWith(
  email: string,
  capabilities: { isCoach: boolean; isAthlete: boolean; isCompany?: boolean },
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
export async function billAndPublish(coach: Agent, planId: string): Promise<request.Response> {
  await coach.put(`/plans/${planId}/billing`).send({ amountCents: 5000, dueDate: "2026-01-05" });
  return publishAtLatest(coach, planId);
}

/** L'adresse d'un compte, lue dans sa session : c'est elle qu'une invitation nominative vise. */
export async function emailOf(agent: Agent): Promise<string> {
  const session = await agent.get("/api/auth/get-session");
  return required(session.body?.user?.email, "adresse de session");
}

/** L'id d'un compte, lu dans sa session. */
export async function idOf(agent: Agent): Promise<string> {
  const session = await agent.get("/api/auth/get-session");
  return required(session.body?.user?.id, "id de session");
}

/** Le coach invite l'adresse de `invited` — la seule forme d'invitation qui la lui destine. */
export async function inviteFor(coach: Agent, invited: Agent): Promise<request.Response> {
  return coach.post("/invitations").send({ email: await emailOf(invited) });
}

/**
 * Lie un athlète à un coach par invitation, et rend les deux bouts de la relation.
 *
 * UNE fonction pour toute la suite, là où quatorze copies locales vivaient : chacune visait
 * l'invitation générique, et le passage au tout-nominatif (#390) les aurait toutes à reprendre.
 */
export async function linkRelation(
  coach: Agent,
  athlete: Agent,
): Promise<{ athleteId: string; coachId: string }> {
  const invitation = await inviteFor(coach, athlete);
  const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
  expect(accepted.status).toBe(201);
  return { athleteId: accepted.body[0].athleteId, coachId: accepted.body[0].coachId };
}

// Lie un athlète à un coach par invitation et rend l'id de l'athlète.
export async function link(coach: Agent, athlete: Agent): Promise<string> {
  return (await linkRelation(coach, athlete)).athleteId;
}

/**
 * L'entreprise invite le Coach dans son équipe, et il accepte (#601) : le chemin réel, invitation
 * comprise, plutôt qu'une ligne posée en base qu'aucune route ne produirait.
 */
export async function joinOrganization(company: Agent, coach: Agent): Promise<void> {
  const invited = await company
    .post("/organization/invitations")
    .send({ email: await emailOf(coach), role: "COACH" });
  expect(invited.status).toBe(201);
  expect((await coach.post(`/organization-invitations/${invited.body.id}/accept`)).status).toBe(
    204,
  );
}
