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

/**
 * Une version bien formée, que cite un client qui ne peut pas lire la vraie (#604) : sans elle, le
 * 400 de validation masquerait le 404 du scope qu'on éprouve. La garde scopée répond avant toute
 * comparaison de version.
 */
export const ANY_VERSION = "2026-01-01T00:00:00.000Z";

/** La version d'une semaine (#604) : elle n'a pas de route à elle, elle se lit dans son cycle. */
export async function weekVersionOf(agent: Agent, planId: string, weekId: string): Promise<string> {
  const plan = await agent.get(`/plans/${planId}`);
  const week = plan.body?.weeks?.find((w: { id: string }) => w.id === weekId);
  return required(week?.updatedAt, `version de la semaine ${weekId}`);
}

/** Un geste sur une semaine tel qu'un client à jour l'envoie (#604) : en citant sa version du moment. */
export async function atWeekVersion<T extends object = object>(
  agent: Agent,
  planId: string,
  weekId: string,
  fields?: T,
): Promise<T & { expectedUpdatedAt: string }> {
  return {
    ...(fields as T),
    expectedUpdatedAt: await weekVersionOf(agent, planId, weekId),
  };
}

/** Un PATCH tel qu'un client à jour l'envoie (#604) : en citant la version du moment. */
export async function patchAtLatest(
  agent: Agent,
  path: string,
  fields: object,
): Promise<request.Response> {
  return agent.patch(path).send({ ...fields, expectedUpdatedAt: await versionOf(agent, path) });
}

/** Un PUT tel qu'un client à jour l'envoie (#604) : en citant la version du moment. */
export async function putAtLatest(
  agent: Agent,
  path: string,
  fields: object,
): Promise<request.Response> {
  return agent.put(path).send({ ...fields, expectedUpdatedAt: await versionOf(agent, path) });
}

/** Un DELETE tel qu'un client à jour l'envoie (#604) : sans corps, la version voyage en requête. */
export async function deleteAtLatest(agent: Agent, path: string): Promise<request.Response> {
  return agent.delete(path).query({ expectedUpdatedAt: await versionOf(agent, path) });
}

/**
 * Refusé par un VERROU de l'élément, et non par sa version : depuis #604, les deux répondent 409,
 * et seul le message les distingue.
 */
export function expectLocked(res: { status: number; body?: { message?: unknown } }): void {
  expect(res.status).toBe(409);
  expect(res.body?.message).not.toBe(STALE_WRITE);
}
