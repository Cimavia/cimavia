import * as Sentry from "@sentry/react";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api";
import { createQueryClient } from "./query-client";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

afterEach(() => {
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

const unauthorized = () => new ApiError(401, "Unauthorized", null);

/** Le client réel, avec un espion à la place de la relecture de session. */
function setup() {
  const onUnauthorized = vi.fn();
  return { client: createQueryClient(onUnauthorized), onUnauthorized };
}

describe("createQueryClient", () => {
  it("fait relire la session quand une lecture prend un 401", async () => {
    const { client, onUnauthorized } = setup();

    await client
      .fetchQuery({ queryKey: ["athletes"], queryFn: () => Promise.reject(unauthorized()) })
      .catch(() => {});

    // Sans ce signal, la garde laisse passer une session morte tant que l'onglet garde le focus :
    // Better Auth ne relit la session qu'au changement d'onglet (#336).
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("fait relire la session quand un enregistrement prend un 401", async () => {
    const { client, onUnauthorized } = setup();
    const save = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(unauthorized()),
    });

    await save.execute(undefined).catch(() => {});

    // C'est LE cas du constat : le coach clique « Enregistrer » sur un constructeur rempli.
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("appelle le signal même quand l'écran a son propre onError", async () => {
    const { client, onUnauthorized } = setup();
    const screenOnError = vi.fn();
    const save = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(unauthorized()),
      onError: screenOnError,
    });

    await save.execute(undefined).catch(() => {});

    // La raison de le poser sur le CACHE : un `onError` de `defaultOptions` serait remplacé par
    // celui de chaque écran, soit presque tous les enregistrements de l'app.
    expect(screenOnError).toHaveBeenCalledOnce();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("laisse les autres erreurs aux écrans", async () => {
    const { client, onUnauthorized } = setup();

    await client
      .fetchQuery({
        queryKey: ["plan"],
        queryFn: () => Promise.reject(new ApiError(403, "Forbidden", null)),
        retry: false,
      })
      .catch(() => {});

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  describe("nouvel essai d'une lecture", () => {
    const retry = createQueryClient(() => {}).getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: unknown,
    ) => boolean;

    it("rejoue une fois une lecture qui échoue", () => {
      expect(retry(0, new TypeError("Failed to fetch"))).toBe(true);
      expect(retry(1, new TypeError("Failed to fetch"))).toBe(false);
    });

    it("ne rejoue pas un 401", () => {
      // La même session serait refusée de la même façon : l'essai ne ferait que retarder la
      // fenêtre de reconnexion.
      expect(retry(0, unauthorized())).toBe(false);
    });
  });

  // La décision, cas par cas, est éprouvée dans `@cmv/shared` ; ici, seulement le câblage (#699).
  describe("signalement à Sentry", () => {
    const failing = (error: unknown) => () => Promise.reject(error);

    it("signale la réponse que l'API n'a pas écrite, sur une lecture", async () => {
      const { client } = setup();
      const proxyPage = new ApiError(502, "Erreur 502", null, false);

      await client
        .fetchQuery({ queryKey: ["athletes"], queryFn: failing(proxyPage), retry: false })
        .catch(() => {});

      expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(proxyPage);
    });

    it("signale un bug du client levé dans un enregistrement", async () => {
      const { client } = setup();
      const bug = new TypeError("x is undefined");
      const save = client.getMutationCache().build(client, { mutationFn: failing(bug) });

      await save.execute(undefined).catch(() => {});

      expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(bug);
    });

    it("ne reprend pas la réponse que l'API a écrite : elle l'a déjà capturée (#697)", async () => {
      const { client } = setup();

      await client
        .fetchQuery({
          queryKey: ["plan"],
          queryFn: failing(new ApiError(500, "Boum", null, true)),
          retry: false,
        })
        .catch(() => {});

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("ne signale rien hors-ligne", async () => {
      onlineManager.setOnline(false);
      const { client } = setup();

      await client
        .fetchQuery({
          queryKey: ["athletes"],
          queryFn: failing(new TypeError("Failed to fetch")),
          retry: false,
          networkMode: "always",
        })
        .catch(() => {});

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("ne signale pas un 401, qui relit la session", async () => {
      const { client, onUnauthorized } = setup();

      await client
        .fetchQuery({ queryKey: ["athletes"], queryFn: failing(unauthorized()), retry: false })
        .catch(() => {});

      expect(onUnauthorized).toHaveBeenCalledOnce();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });
});
