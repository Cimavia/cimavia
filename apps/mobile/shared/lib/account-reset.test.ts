import { beforeEach, describe, expect, it, vi } from "vitest";

const purgeAllDocuments = vi.fn();
vi.mock("@/shared/lib/document-cache", () => ({ purgeAllDocuments: () => purgeAllDocuments() }));

const purgeVideoThumbnails = vi.fn();
vi.mock("@/shared/lib/video-thumbnail", () => ({
  purgeVideoThumbnails: () => purgeVideoThumbnails(),
}));

const resetQueryCache = vi.fn(async () => undefined);
vi.mock("@/shared/lib/query", () => ({ resetQueryCache: () => resetQueryCache() }));

const { resetAccountData } = await import("./account-reset");

beforeEach(() => {
  vi.clearAllMocks();
  resetQueryCache.mockResolvedValue(undefined);
});

describe("resetAccountData", () => {
  it("efface le cache de requêtes, les documents ET les vignettes vidéo de l'appareil", async () => {
    await resetAccountData();

    expect(purgeAllDocuments).toHaveBeenCalledTimes(1);
    expect(purgeVideoThumbnails).toHaveBeenCalledTimes(1);
    expect(resetQueryCache).toHaveBeenCalledTimes(1);
  });

  /**
   * Les documents partent EN PREMIER : ce sont eux qui s'ouvrent — un PDF d'entraînement du coach
   * précédent se lit, là où une entrée AsyncStorage demande un outil. Si un seul des deux devait
   * passer, c'est celui-là.
   */
  it("efface les fichiers même quand le cache de requêtes résiste", async () => {
    resetQueryCache.mockRejectedValueOnce(new Error("AsyncStorage indisponible"));

    await expect(resetAccountData()).rejects.toThrow();

    expect(purgeAllDocuments).toHaveBeenCalledTimes(1);
    expect(purgeVideoThumbnails).toHaveBeenCalledTimes(1);
  });
});
