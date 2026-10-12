import { Role } from "@cmv/shared";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, signUp } from "../support/actors";
import { baseURL } from "../support/app";

describe("Version du produit (#186)", () => {
  let athlete: Agent;

  beforeAll(async () => {
    athlete = await signUp("athlete-version@cmv.test", Role.ATHLETE);
  });

  /**
   * Le point de la route, et la raison pour laquelle elle n'est PAS sur `/health` : la version qui
   * tourne dit quels correctifs sont passés. `/health` est `@AllowAnonymous()`, `/version` ne l'est
   * pas — et rien ne le garantit sinon ce test, une décoration oubliée ne se voyant nulle part
   * ailleurs.
   */
  it("refuse un appel sans session", async () => {
    const res = await request(baseURL).get("/version");

    expect(res.status).toBe(401);
  });

  /**
   * Les e2e tournent HORS image : ni `APP_VERSION` ni `APP_BUILD` n'existent. C'est exactement le
   * cas que la règle dure n°5 protège — l'API dit qu'elle ne sait pas, au lieu d'annoncer un
   * « 0.0.0 » que le client afficherait comme un vrai numéro. Le cas où l'image les porte est
   * couvert par `version.service.test.ts`, qu'aucun harnais e2e ne peut reproduire ici.
   */
  it("dit qu'il ne sait pas plutôt que d'inventer un numéro hors image", async () => {
    const res = await athlete.get("/version");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: null, build: null, env: "development" });
  });
});

/**
 * Les sondes de l'hébergeur : elles passent SANS session, sinon l'instance serait déclarée morte
 * et retirée du trafic. La panne de base, elle, est dans `health.service.test.ts` — la couper ici
 * ferait tomber toute la suite.
 */
describe("Sondes de santé", () => {
  it("liveness : répond sans session et sans toucher la base", async () => {
    const res = await request(baseURL).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it("readiness : répond sans session, base joignable", async () => {
    const res = await request(baseURL).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "up", timestamp: expect.any(String) });
  });
});
