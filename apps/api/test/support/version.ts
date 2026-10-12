import { STALE_WRITE } from "@cmv/shared";
import type request from "supertest";
import { expect } from "vitest";
import { type Agent, required } from "./actors";

/**
 * La version qu'un élément porte À L'INSTANT (#604) : celle qu'un client à jour cite en écrivant.
 * Les tests de concurrence, eux, citent une version lue AVANT l'écriture concurrente.
 */
export async function versionOf(agent: Agent, path: string): Promise<string> {
  const res = await agent.get(path);
  return required(res.body?.updatedAt, `version de ${path}`);
}

/** Un PATCH tel qu'un client à jour l'envoie (#604) : en citant la version du moment. */
export async function patchAtLatest(
  agent: Agent,
  path: string,
  fields: object,
): Promise<request.Response> {
  return agent.patch(path).send({ ...fields, expectedUpdatedAt: await versionOf(agent, path) });
}

/**
 * Refusé par un VERROU de l'élément, et non par sa version : depuis #604, les deux répondent 409,
 * et seul le message les distingue.
 */
export function expectLocked(res: { status: number; body?: { message?: unknown } }): void {
  expect(res.status).toBe(409);
  expect(res.body?.message).not.toBe(STALE_WRITE);
}
