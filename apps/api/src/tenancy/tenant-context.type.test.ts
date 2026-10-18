import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import {
  currentActor,
  exercisedOrThrow,
  runAsCoach,
  TENANT_CLS_KEY,
  type TenantContext,
} from "./tenant-context.type";

const ACTOR: TenantContext = {
  userId: "usr_1",
  capabilities: { isCoach: true, isAthlete: true, isCompany: false },
  exercised: "coach",
};

/** Le CLS réduit à ce que ces fonctions lisent. */
const clsHolding = (actor: TenantContext | undefined) =>
  ({ get: () => actor }) as unknown as ClsService;

describe("currentActor", () => {
  it("rend l'acteur que l'interceptor a posé", () => {
    expect(currentActor(clsHolding(ACTOR))).toBe(ACTOR);
  });

  // Hors requête (tâche planifiée, script) : un bug de câblage, jamais un acteur par défaut.
  it("lève hors contexte tenant", () => {
    expect(() => currentActor(clsHolding(undefined))).toThrow(
      "[tenancy] acteur courant absent — appel hors contexte tenant",
    );
  });
});

describe("exercisedOrThrow", () => {
  it("rend la capacité exercée", () => {
    expect(exercisedOrThrow({ ...ACTOR, exercised: "athlete" })).toBe("athlete");
  });

  /**
   * Répondre « athlète » parce que ce n'est pas « coach » enverrait un message à la mauvaise
   * personne : une route sans `@RequireCapability` doit casser.
   */
  it("lève quand la route n'a déclaré aucune capacité", () => {
    expect(() => exercisedOrThrow({ ...ACTOR, exercised: null })).toThrow(
      "[tenancy] capacité exercée inconnue — la route déclare-t-elle @RequireCapability ?",
    );
  });
});

describe("runAsCoach", () => {
  it("pose le Coach choisi, à titre de coach, dans un contexte à lui", async () => {
    const set = vi.fn();
    const cls = { run: (fn: () => unknown) => fn(), set } as unknown as ClsService;
    await expect(runAsCoach(cls, "usr_m", async () => "fait")).resolves.toBe("fait");
    expect(set).toHaveBeenCalledWith(TENANT_CLS_KEY, {
      userId: "usr_m",
      capabilities: { isCoach: true, isAthlete: false, isCompany: false },
      exercised: "coach",
    });
  });
});
