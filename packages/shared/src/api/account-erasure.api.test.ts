import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AccountErasureApi,
  createAccountErasureApi,
  createConfirmedErasure,
  erasureFailureOf,
  erasureOutcomeUnknown,
  type SessionReader,
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

describe("createConfirmedErasure", () => {
  const input = { password: "secret" };
  const lost = new TypeError("Network request failed");
  const unauthorized = new ApiError(401, "Unauthorized", null);
  const erase = vi.fn<AccountErasureApi["erase"]>();
  const readSession = vi.fn<SessionReader>();
  const noSession = { data: null, error: null };
  const stillSignedIn = { data: { user: { id: "me" } }, error: null };

  beforeEach(() => {
    erase.mockReset().mockResolvedValue(undefined);
    readSession.mockReset().mockResolvedValue(stillSignedIn);
  });

  const erasure = () => createConfirmedErasure({ erase }, readSession);

  it("réussit sans relire la session quand l'API répond", async () => {
    const confirmed = erasure();

    await expect(confirmed.erase(input)).resolves.toBeUndefined();

    expect(erase).toHaveBeenCalledExactlyOnceWith(input);
    expect(readSession).not.toHaveBeenCalled();
    expect(confirmed.outcomeWasUnknown()).toBe(false);
  });

  // Le compte part au COMMIT : la réponse perdue n'est pas un échec si la session a disparu.
  it("réussit quand la réponse se perd et que la session n'existe plus", async () => {
    erase.mockRejectedValue(lost);
    readSession.mockResolvedValue(noSession);

    await expect(erasure().erase(input)).resolves.toBeUndefined();
  });

  it("borne la relecture par une durée, sans AbortSignal.timeout", async () => {
    erase.mockRejectedValue(lost);

    await erasure()
      .erase(input)
      .catch(() => undefined);

    expect(readSession).toHaveBeenCalledExactlyOnceWith({
      fetchOptions: { timeout: expect.any(Number) },
    });
  });

  it.each([
    ["la session existe encore", async () => stillSignedIn],
    ["la relecture répond une erreur", async () => ({ data: null, error: { status: 502 } })],
    ["la relecture échoue", () => Promise.reject(new TypeError("Network request failed"))],
  ])("rend l'échec et retient l'issue inconnue quand %s", async (_case, reply) => {
    erase.mockRejectedValue(lost);
    readSession.mockImplementation(reply);
    const confirmed = erasure();

    await expect(confirmed.erase(input)).rejects.toBe(lost);

    expect(confirmed.outcomeWasUnknown()).toBe(true);
  });

  it("ne relit pas la session sur un refus écrit par l'API", async () => {
    const refused = new ApiError(429, "Trop d'essais", null);
    erase.mockRejectedValue(refused);
    const confirmed = erasure();

    await expect(confirmed.erase(input)).rejects.toBe(refused);

    expect(readSession).not.toHaveBeenCalled();
    expect(confirmed.outcomeWasUnknown()).toBe(false);
  });

  // Sans issue inconnue avant lui, le 401 dit que la session était perdue avant le geste.
  it("rend le 401 d'un premier essai", async () => {
    erase.mockRejectedValue(unauthorized);

    await expect(erasure().erase(input)).rejects.toBe(unauthorized);
  });

  it("réussit sur le 401 d'un essai qui suit une issue inconnue", async () => {
    erase.mockRejectedValueOnce(lost).mockRejectedValueOnce(unauthorized);
    const confirmed = erasure();

    await expect(confirmed.erase(input)).rejects.toBe(lost);
    await expect(confirmed.erase(input)).resolves.toBeUndefined();
  });
});
