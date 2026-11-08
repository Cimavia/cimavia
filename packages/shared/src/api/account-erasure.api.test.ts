import { describe, expect, it, vi } from "vitest";
import { createAccountErasureApi, erasureFailureOf } from "./account-erasure.api";
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
