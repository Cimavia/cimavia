import { describe, expect, it } from "vitest";
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
