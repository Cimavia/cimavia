import { describe, expect, it, vi } from "vitest";
import {
  createAccountErasureApi,
  erasureFailureOf,
  erasureOutcomeUnknown,
} from "./account-erasure.api";
import { type ApiClient, ApiError } from "./client";
import { ProblemType } from "./problem";

describe("createAccountErasureApi", () => {
  it("envoie le mot de passe en POST sur /me/erasure", async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    const erasure = createAccountErasureApi({ post } as unknown as ApiClient);

    await erasure.erase({ password: "secret" });

    expect(post).toHaveBeenCalledExactlyOnceWith("/me/erasure", { password: "secret" });
  });
});

describe("erasureFailureOf", () => {
  const rejected = new ApiError(403, "Refus", null, true, ProblemType.ERASURE_PASSWORD_REJECTED);

  it.each([
    ["un mot de passe refusé", rejected, "wrongPassword"],
    ["trop d'essais", new ApiError(429, "Trop d'essais", null), "tooManyAttempts"],
    ["un compte occupé ailleurs", new ApiError(409, "Réessaie", null), "busy"],
  ])("reconnaît %s", (_case, error, expected) => {
    expect(erasureFailureOf(error)).toBe(expected);
  });

  // Dire « mot de passe incorrect » sur un autre 403 ferait retaper un mot de passe juste.
  it.each([
    ["un autre 403", new ApiError(403, "Interdit", null)],
    ["une panne serveur", new ApiError(500, "Erreur", null)],
    ["une panne réseau", new TypeError("Failed to fetch")],
    ["pas d'erreur", null],
  ])("ne reconnaît pas %s", (_case, error) => {
    expect(erasureFailureOf(error)).toBeNull();
  });
});

describe("erasureOutcomeUnknown", () => {
  it.each([
    ["une coupure réseau", new TypeError("Failed to fetch")],
    ["une erreur de proxy", new ApiError(403, "Erreur 403", null, false)],
    ["une panne de l'API", new ApiError(500, "Erreur", null)],
  ])("ne sait pas après %s", (_case, error) => {
    expect(erasureOutcomeUnknown(error)).toBe(true);
  });

  // Une réponse écrite par l'API : elle a refusé, et le compte est toujours là.
  it.each([
    ["un corps invalide", new ApiError(400, "Invalide", null)],
    ["un autre 403", new ApiError(403, "Interdit", null)],
    ["un 499, juste sous les pannes", new ApiError(499, "Annulé", null)],
    [
      "un mot de passe refusé",
      new ApiError(403, "", null, true, ProblemType.ERASURE_PASSWORD_REJECTED),
    ],
    ["trop d'essais", new ApiError(429, "Trop", null)],
    ["un compte occupé", new ApiError(409, "Réessaie", null)],
    ["une session perdue", new ApiError(401, "Unauthorized", null)],
    // Le statut suffit, même écrit par un proxy : rien n'a pu partir sans session.
    ["une session perdue, vue d'un proxy", new ApiError(401, "Erreur 401", null, false)],
  ])("sait après %s", (_case, error) => {
    expect(erasureOutcomeUnknown(error)).toBe(false);
  });
});
