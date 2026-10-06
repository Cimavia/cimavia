import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type ApiFetch,
  apiErrorMessage,
  createApiClient,
  isUnauthorizedError,
} from "./client";

/** Un `fetch` qui répond toujours `status`, avec le corps d'erreur que NestJS renverrait. */
function answering(status: number): ApiFetch {
  return () =>
    Promise.resolve({
      ok: status < 400,
      status,
      text: () => Promise.resolve(JSON.stringify({ message: "Unauthorized", statusCode: status })),
    });
}

/** L'erreur réellement levée par le client — c'est elle que les apps verront passer. */
async function errorOf(status: number): Promise<unknown> {
  const api = createApiClient({ baseUrl: "http://api.test", fetchFn: answering(status) });
  return api.get("/athletes").catch((error: unknown) => error);
}

describe("isUnauthorizedError", () => {
  it("reconnaît le 401 que le client lève sur une session refusée", async () => {
    // Construite par le vrai client plutôt qu'à la main : c'est ce chemin — réponse NestJS →
    // `ApiError` — que le signal global des apps écoute (#336).
    expect(isUnauthorizedError(await errorOf(401))).toBe(true);
  });

  it.each([403, 404, 422, 500])("ne prend pas un %s pour une session perdue", async (status) => {
    // Un 403 est un REFUS de droit, la session est bien là : le traiter comme un 401 ferait
    // demander un mot de passe à qui s'est simplement trompé d'écran.
    expect(isUnauthorizedError(await errorOf(status))).toBe(false);
  });

  it("ne prend pas une panne réseau pour une session perdue", () => {
    // Le `fetch` qui rejette ne produit pas d'`ApiError` : rien ne dit alors que la session est
    // morte, et un Wi-Fi coupé ne doit pas redemander un mot de passe.
    expect(isUnauthorizedError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isUnauthorizedError(null)).toBe(false);
  });

  it("lit le statut, pas le message", () => {
    // Le message est celui de l'API, donc traduisible et changeant ; le statut est le contrat.
    expect(isUnauthorizedError(new ApiError(401, "Session expirée", null))).toBe(true);
    expect(isUnauthorizedError(new ApiError(400, "Unauthorized", null))).toBe(false);
  });
});

describe("apiErrorMessage", () => {
  it("rend le message de l'API, qui dit déjà quoi corriger", () => {
    expect(apiErrorMessage(new ApiError(400, "La date ne tombe pas dans la semaine 2", null))).toBe(
      "La date ne tombe pas dans la semaine 2",
    );
  });

  it("n'a rien à dire d'une erreur qui ne vient pas de l'API", () => {
    // Panne réseau : l'appelant retombe sur son message générique.
    expect(apiErrorMessage(new TypeError("Failed to fetch"))).toBeNull();
  });

  it("tait le « Unauthorized » brut d'une session perdue", async () => {
    // Construit par le vrai client : c'est ce corps NestJS que l'écran afficherait tel quel, en
    // anglais, alors que l'app explique déjà la perte de session ailleurs (#336).
    expect(apiErrorMessage(await errorOf(401))).toBeNull();
  });
});

type Call = { url: string; init: Parameters<ApiFetch>[1] };

/** Un `fetch` qui enregistre ses appels et répond `status` avec `body` brut (déjà sérialisé). */
function recording(status: number, body: string) {
  const calls: Call[] = [];
  const fetchFn: ApiFetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(body) });
  };
  return { calls, fetchFn };
}

describe("createApiClient — la requête", () => {
  it.each([
    ["get", "GET"],
    ["delete", "DELETE"],
  ] as const)("%s part en %s sur baseUrl + chemin, sans corps ni Content-Type", async (verb, method) => {
    const { calls, fetchFn } = recording(200, "{}");
    await createApiClient({ baseUrl: "http://api.test", fetchFn })[verb]("/plans/p1");

    expect(calls).toEqual([{ url: "http://api.test/plans/p1", init: { method, headers: {} } }]);
  });

  it.each([
    ["post", "POST"],
    ["patch", "PATCH"],
    ["put", "PUT"],
  ] as const)("%s part en %s avec le corps sérialisé en JSON", async (verb, method) => {
    const { calls, fetchFn } = recording(200, "{}");
    await createApiClient({ baseUrl: "http://api.test", fetchFn })[verb]("/plans", { title: "A" });

    expect(calls).toEqual([
      {
        url: "http://api.test/plans",
        init: {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "A" }),
        },
      },
    ]);
  });

  // Un POST d'action (`/publish`) n'a rien à envoyer : annoncer du JSON sans en joindre ferait
  // lire un corps vide au serveur.
  it("n'annonce aucun JSON sur un POST sans corps", async () => {
    const { calls, fetchFn } = recording(200, "{}");
    await createApiClient({ baseUrl: "http://api.test", fetchFn }).post("/plans/p1/publish");

    expect(calls[0]?.init).toEqual({ method: "POST", headers: {} });
  });

  /**
   * Le cookie de session (mobile) change au fil de la vie de l'app : les en-têtes sont relus à
   * CHAQUE requête. Figés à la création du client, ils enverraient une session périmée.
   */
  it("réévalue les en-têtes à chaque requête", async () => {
    const { calls, fetchFn } = recording(200, "{}");
    let cookie = "session=a";
    const api = createApiClient({
      baseUrl: "http://api.test",
      fetchFn,
      headers: () => ({ Cookie: cookie }),
    });

    await api.get("/me");
    cookie = "session=b";
    await api.patch("/me", { name: "N" });

    expect(calls.map((call) => call.init.headers)).toEqual([
      { Cookie: "session=a" },
      { Cookie: "session=b", "Content-Type": "application/json" },
    ]);
  });

  it("transmet credentials quand l'app le demande (cookie du navigateur), et seulement alors", async () => {
    const withCookie = recording(200, "{}");
    await createApiClient({
      baseUrl: "http://api.test",
      fetchFn: withCookie.fetchFn,
      credentials: "include",
    }).get("/me");
    const without = recording(200, "{}");
    await createApiClient({ baseUrl: "http://api.test", fetchFn: without.fetchFn }).get("/me");

    expect(withCookie.calls[0]?.init.credentials).toBe("include");
    expect(without.calls[0]?.init).not.toHaveProperty("credentials");
  });
});

describe("createApiClient — la réponse", () => {
  it("rend le JSON d'une réponse réussie", async () => {
    const { fetchFn } = recording(200, JSON.stringify({ id: "p1", title: "A" }));
    const api = createApiClient({ baseUrl: "http://api.test", fetchFn });

    await expect(api.get("/plans/p1")).resolves.toEqual({ id: "p1", title: "A" });
  });

  // 204 (DELETE) : aucun corps à lire — le lire échouerait sur certains runtimes.
  it("rend undefined sur un 204, sans lire le corps", async () => {
    const text = () => Promise.reject(new Error("corps lu sur un 204"));
    const fetchFn: ApiFetch = () => Promise.resolve({ ok: true, status: 204, text });
    const api = createApiClient({ baseUrl: "http://api.test", fetchFn });

    await expect(api.delete("/plans/p1")).resolves.toBeUndefined();
  });

  it("rend null sur une réponse réussie au corps vide", async () => {
    const { fetchFn } = recording(200, "");
    const api = createApiClient({ baseUrl: "http://api.test", fetchFn });

    await expect(api.get("/me/coach")).resolves.toBeNull();
  });

  /**
   * Un portail captif répond 200 avec sa page HTML : la rendre comme un `T` casserait plus loin,
   * sur un champ absent, sans dire pourquoi (#320).
   */
  it("rejette une réponse réussie dont le corps n'est pas du JSON", async () => {
    const { fetchFn } = recording(200, "<!doctype html><title>Wi-Fi gratuit</title>");
    const error = await createApiClient({ baseUrl: "http://api.test", fetchFn })
      .get("/me")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, message: "Réponse non-json (200)", fromApi: false });
  });
});

describe("createApiClient — les erreurs", () => {
  async function rejection(status: number, body: string): Promise<ApiError> {
    const { fetchFn } = recording(status, body);
    const error = await createApiClient({ baseUrl: "http://api.test", fetchFn })
      .get("/x")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  it("porte le statut et le message d'une erreur NestJS", async () => {
    const error = await rejection(404, JSON.stringify({ message: "Cycle introuvable" }));

    expect(error).toMatchObject({
      status: 404,
      message: "Cycle introuvable",
      fieldErrors: null,
      fromApi: true,
    });
    expect(apiErrorMessage(error)).toBe("Cycle introuvable");
    expect(error.name).toBe("ApiError");
    expect(error).toBeInstanceOf(Error);
  });

  /**
   * Erreur de validation Zod : `message` est la LISTE des champs fautifs. Le message affiché est
   * le premier ; la liste entière reste disponible pour marquer chaque champ du formulaire.
   */
  it("expose les erreurs de champ d'une validation, et montre la première", async () => {
    const fieldErrors = [
      { path: "title", message: "Titre requis" },
      { path: "startDate", message: "Date invalide" },
    ];
    const error = await rejection(400, JSON.stringify({ message: fieldErrors }));

    expect(error).toMatchObject({ status: 400, message: "Titre requis", fieldErrors });
    expect(apiErrorMessage(error)).toBe("Titre requis");
  });

  /**
   * Faute de message écrit par l'API, le client en fabrique un pour les logs et Sentry — mais
   * `apiErrorMessage` le tait : « Erreur 502 » ou « Service Unavailable » prendraient la place du
   * message traduit de l'écran, qui dit, lui, quel geste a échoué (#320).
   */
  describe("sans message écrit par l'API, l'écran garde le sien", () => {
    it("une liste de champs vide", async () => {
      const error = await rejection(400, JSON.stringify({ message: [] }));

      expect(error).toMatchObject({
        status: 400,
        message: "Requête invalide",
        fieldErrors: [],
        fromApi: false,
      });
      expect(apiErrorMessage(error)).toBeNull();
    });

    it("le seul libellé HTTP", async () => {
      const error = await rejection(503, JSON.stringify({ error: "Service Unavailable" }));

      expect(error).toMatchObject({
        status: 503,
        message: "Service Unavailable",
        fieldErrors: null,
        fromApi: false,
      });
      expect(apiErrorMessage(error)).toBeNull();
    });

    // Pas de corps du tout : le statut est la seule information, il reste lisible dans Sentry.
    it("aucun corps", async () => {
      const error = await rejection(502, "");

      expect(error).toMatchObject({
        status: 502,
        message: "Erreur 502",
        fieldErrors: null,
        fromApi: false,
      });
      expect(apiErrorMessage(error)).toBeNull();
    });

    /**
     * La page HTML de cloudflared pendant un redémarrage de l'API. Elle levait une `SyntaxError`,
     * que Sentry ne distinguait pas d'un bug applicatif : le statut est ce qui dit la panne.
     */
    it("un corps qui n'est pas du JSON", async () => {
      const error = await rejection(502, "<!doctype html><title>Bad gateway</title>");

      expect(error).toMatchObject({
        status: 502,
        message: "Réponse non-json (502)",
        fieldErrors: null,
        fromApi: false,
      });
      expect(apiErrorMessage(error)).toBeNull();
    });
  });
});

/**
 * Le `fetch` par défaut est lu À L'IMPORT du module : chaque test recharge donc `./client` après
 * avoir posé le global voulu.
 */
describe("createApiClient — le fetch du runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * Le `fetch` du navigateur lève « Illegal invocation » s'il est appelé avec un autre `this` que
   * `globalThis` — ce qui arrive dès qu'on le détache pour l'appeler comme méthode d'un objet.
   */
  it("appelle le fetch global lié à globalThis quand aucun n'est fourni", async () => {
    let receiver: unknown = null;
    vi.stubGlobal("fetch", function (this: unknown) {
      receiver = this;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}") });
    });
    vi.resetModules();
    const { createApiClient: create } = await import("./client");

    await create({ baseUrl: "http://api.test" }).get("/me");

    expect(receiver).toBe(globalThis);
  });

  it("refuse de se construire dans un runtime sans fetch", async () => {
    vi.stubGlobal("fetch", undefined);
    vi.resetModules();
    const { createApiClient: create } = await import("./client");

    expect(() => create({ baseUrl: "http://api.test" })).toThrow(
      "[api] aucun fetch disponible dans ce runtime",
    );
  });

  // Le faux injecté l'emporte : c'est ce qui permet de tester sans réseau.
  it("préfère le fetch injecté à celui du runtime", async () => {
    const runtime = vi.fn();
    vi.stubGlobal("fetch", runtime);
    vi.resetModules();
    const { createApiClient: create } = await import("./client");
    const { calls, fetchFn } = recording(200, "{}");

    await create({ baseUrl: "http://api.test", fetchFn }).get("/me");

    expect(calls).toHaveLength(1);
    expect(runtime).not.toHaveBeenCalled();
  });
});
