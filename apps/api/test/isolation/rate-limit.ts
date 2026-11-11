import { Role } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { RATE_LIMITS } from "../../src/rate-limit/rate-limit.policy";
import { type Agent, signUp } from "../support/actors";

/**
 * Limite de débit des routes métier (#782). Comptes préfixés `rate-`, pour ne croiser aucun autre
 * domaine : chacun use ses propres compteurs.
 *
 * Les requêtes portent un corps vide, que la validation refuse (400) : la garde compte AVANT le
 * pipe, donc un refus coûte comme un succès — sans quoi un script n'aurait qu'à envoyer n'importe
 * quoi. Rien n'est écrit, aucun e-mail ne part.
 */
describe("Limite de débit : au-delà de la borne 429, et un autre acteur n'est pas touché (#782)", () => {
  let coach: Agent;
  let other: Agent;

  beforeAll(async () => {
    coach = await signUp("rate-coach@cmv.test", Role.COACH);
    other = await signUp("rate-other@cmv.test", Role.COACH);
  });

  async function statuses(agent: Agent, path: string, count: number): Promise<number[]> {
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push((await agent.post(path).send({})).status);
    return result;
  }

  it("borne les invitations par Coach", async () => {
    const { limit } = RATE_LIMITS.invitation;

    const allowed = await statuses(coach, "/invitations", limit);
    expect(new Set(allowed)).toEqual(new Set([400]));

    const refused = await coach.post("/invitations").send({});
    expect(refused.status).toBe(429);
    expect(refused.headers["content-type"]).toContain("application/problem+json");
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);

    expect((await other.post("/invitations").send({})).status).toBe(400);
  });

  it("borne les URL d'upload signées, sans toucher une autre route d'upload", async () => {
    const { limit } = RATE_LIMITS.uploadPerMinute;
    const messageUpload = "/conversations/inconnue/messages/upload-url";

    const allowed = await statuses(coach, messageUpload, limit);
    expect(allowed).not.toContain(429);
    expect((await coach.post(messageUpload).send({})).status).toBe(429);

    expect((await other.post(messageUpload).send({})).status).not.toBe(429);
    expect((await coach.post("/exercises/inconnu/documents/upload-url").send({})).status).toBe(400);
  });
});
