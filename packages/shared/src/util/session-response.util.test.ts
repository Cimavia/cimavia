import { beforeEach, describe, expect, it, vi } from "vitest";
import { refuseUnreadableSession } from "./session-response.util";

const URL_SESSION = "https://api.cimavia.test/api/auth/get-session";
const onRefused = vi.fn();
const HEADERS = { "set-better-auth-cookie": "c" };
const SESSION = JSON.stringify({ session: { id: "s" }, user: { id: "lea", name: "Léa" } });

/** Le paquet compile sans les types du navigateur : le vrai `Response` est testé côté mobile. */
class FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText = "";
  readonly headers: unknown;
  constructor(
    private readonly body: string | null,
    init: Readonly<{ status: number; headers?: unknown }>,
  ) {
    this.status = init.status;
    this.ok = init.status < 300;
    this.headers = init.headers;
  }
  text = async () => this.body ?? "";
}

const refuse = (response: FakeResponse, url = URL_SESSION) =>
  refuseUnreadableSession(FakeResponse, onRefused)({ request: { url }, response });

beforeEach(() => {
  onRefused.mockClear();
});

describe("refuseUnreadableSession", () => {
  it.each([
    ["une session", SESSION],
    ["personne", "null"],
    ["personne, sous sa forme longue", JSON.stringify({ session: null, user: null })],
  ])("laisse passer %s, corps et en-têtes intacts", async (_, body) => {
    const answer = await refuse(new FakeResponse(body, { status: 200, headers: HEADERS }));

    expect(answer?.status).toBe(200);
    expect(await answer?.text()).toBe(body);
    expect(answer?.headers).toBe(HEADERS);
    expect(onRefused).not.toHaveBeenCalled();
  });

  it.each([
    ["une page HTML", "<html></html>"],
    ["un corps vide", ""],
    ["un objet sans session", "{}"],
    ["une session sans identifiant", JSON.stringify({ session: {}, user: {} })],
    ["une chaîne JSON", '"bonjour"'],
  ])("transforme %s en panne", async (_, body) => {
    expect((await refuse(new FakeResponse(body, { status: 200 })))?.status).toBe(502);
    expect(onRefused).toHaveBeenCalledTimes(1);
  });

  it("reconnaît la route malgré ses paramètres", async () => {
    const answer = await refuse(
      new FakeResponse("<html>", { status: 200 }),
      `${URL_SESSION}?disableCache=true`,
    );

    expect(answer?.status).toBe(502);
  });

  it("ne touche pas aux autres routes", async () => {
    const answer = await refuse(
      new FakeResponse("ok", { status: 200 }),
      "https://api.cimavia.test/api/auth/sign-out",
    );

    expect(answer).toBeUndefined();
  });

  // Un 401 de l'API doit garder son statut : c'est lui qui dit que la session est perdue.
  it.each(['{"code":"UNAUTHORIZED"}', ""])("garde le 401 de l'API (%j)", async (body) => {
    const answer = await refuse(new FakeResponse(body, { status: 401 }));

    expect(answer?.status).toBe(401);
    expect(await answer?.text()).toBe(body);
  });

  it("transforme en panne un 401 écrit par un proxy", async () => {
    expect((await refuse(new FakeResponse("<html>", { status: 401 })))?.status).toBe(502);
  });

  it("ne touche pas aux autres échecs", async () => {
    expect(await refuse(new FakeResponse("<html>", { status: 500 }))).toBeUndefined();
  });
});
