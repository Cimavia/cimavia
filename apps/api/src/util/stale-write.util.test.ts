import { STALE_WRITE } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { assertWrittenAtVersion } from "./stale-write.util";

describe("assertWrittenAtVersion", () => {
  it("laisse passer une écriture qui a eu lieu, sans relire", async () => {
    const exists = vi.fn(() => Promise.resolve(true));

    await expect(assertWrittenAtVersion(1, exists, "Introuvable")).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it("répond 409 quand l'élément existe encore : il a changé depuis la lecture", async () => {
    await expect(
      assertWrittenAtVersion(0, () => Promise.resolve(true), "Introuvable"),
    ).rejects.toMatchObject({ status: 409, message: STALE_WRITE });
  });

  // « Recharger » ne trouverait rien : l'élément supprimé se dit comme tel.
  it("répond 404 quand l'élément a disparu", async () => {
    await expect(
      assertWrittenAtVersion(0, () => Promise.resolve(false), "Exercice introuvable"),
    ).rejects.toMatchObject({ status: 404, message: "Exercice introuvable" });
  });
});
