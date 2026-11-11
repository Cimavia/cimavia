import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

describe("zod-config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    z.config({ jitless: true });
  });

  // Par le BARREL, RÉÉVALUÉ après l'espion et sur une config remise à zéro : c'est lui qui doit poser
  // le réglage avant de définir le premier schéma — sonde comprise, puisque Zod sonde à la
  // définition. Sans `resetModules`, un barrel déjà chargé par le même worker garderait des schémas
  // définis avant le test, et le test passerait quoi que fasse `zod-config.ts`.
  it("le paquet ne compile aucun code, ni en se chargeant ni en validant", async () => {
    z.config({ jitless: false });
    vi.resetModules();
    const compile = vi.spyOn(globalThis, "Function");
    const { trackedBlockDtoSchema } = await import("./index");

    const block = {
      blockId: "b1",
      label: null,
      name: "Échauffement",
      settings: { kind: "free" },
      exerciseKeys: [],
      tracking: null,
    };
    trackedBlockDtoSchema.safeParse(block);

    expect(compile).not.toHaveBeenCalled();
  });

  // Ce qui donne son sens au premier : sans le réglage, l'espion voit bien la compilation.
  it("sans lui, Zod compilerait", () => {
    const compile = vi.spyOn(globalThis, "Function");
    z.config({ jitless: false });

    expect(z.object({ nom: z.string() }).parse({ nom: "a" })).toEqual({ nom: "a" });

    expect(compile).toHaveBeenCalled();
  });
});
