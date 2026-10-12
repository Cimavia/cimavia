import { type Agent, required } from "./actors";

/**
 * La version qu'un élément porte À L'INSTANT (#604) : celle qu'un client à jour cite en écrivant.
 * Les tests de concurrence, eux, citent une version lue AVANT l'écriture concurrente.
 */
export async function versionOf(agent: Agent, path: string): Promise<string> {
  const res = await agent.get(path);
  return required(res.body?.updatedAt, `version de ${path}`);
}
