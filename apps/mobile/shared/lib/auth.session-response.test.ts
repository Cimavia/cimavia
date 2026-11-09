import { refuseUnreadableSession } from "@cmv/shared";
import { createAuthClient } from "better-auth/react";
import { describe, expect, it } from "vitest";

const LEA = { session: { id: "s" }, user: { id: "lea" } };

const json = (body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** Le vrai client : c'est son traitement du corps, à la montée de version, qui est en jeu (#439). */
async function afterReread(next: () => Response) {
  let answer = json(LEA);
  const client = createAuthClient({
    baseURL: "https://api.cimavia.test",
    fetchOptions: {
      customFetchImpl: async () => answer(),
      onResponse: refuseUnreadableSession(Response, () => {}),
    },
  });
  const session = client.$store.atoms.session;
  if (session == null) throw new Error("atome de session introuvable");

  await session.get().refetch();
  expect(session.get().data).toEqual(LEA);

  answer = next;
  await session.get().refetch();
  return session.get();
}

describe("relecture de la session à travers le client Better Auth", () => {
  it.each([
    [
      "une page HTML en 200",
      () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
    ],
    ["un corps vide en 200", () => new Response("", { status: 200 })],
    ["un objet quelconque en 200", json({})],
    ["une page HTML en 401", () => new Response("<html></html>", { status: 401 })],
  ])("garde la session connue sur %s", async (_, next) => {
    const state = await afterReread(next);

    expect(state.data).toEqual(LEA);
    expect(state.error?.status).toBe(502);
  });

  it("perd la session quand le serveur répond qu'il n'y a personne", async () => {
    const state = await afterReread(json(null));

    expect(state.data).toBeNull();
    expect(state.error).toBeNull();
  });

  it("perd la session sur un 401", async () => {
    const state = await afterReread(() => new Response("{}", { status: 401 }));

    expect(state.data).toBeNull();
  });
});
