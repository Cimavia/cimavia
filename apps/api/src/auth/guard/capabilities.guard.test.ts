import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { RequireCapability } from "../decorator/require-capability.decorator";
import { CapabilitiesGuard } from "./capabilities.guard";

@RequireCapability("coach")
class CoachController {
  list() {}
}

/** Le contexte d'une requête sur une route coach, avec l'utilisateur que l'AuthGuard aurait posé. */
function contextWith(user: unknown): ExecutionContext {
  return {
    getHandler: () => CoachController.prototype.list,
    getClass: () => CoachController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/**
 * Le seul cas que les e2e n'atteignent pas, parce qu'il suppose un câblage cassé : la garde qui
 * tourne AVANT l'AuthGuard. Elle doit alors casser (500), pas répondre 403 — un 403 passerait pour
 * un refus normal, et la même inversion sur une route sans exigence ouvrirait en silence.
 */
describe("CapabilitiesGuard — ordre des gardes", () => {
  const guard = new CapabilitiesGuard(new Reflector());

  it("lève quand aucun utilisateur n'a été posé avant elle", () => {
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      "[capabilities] utilisateur absent alors que la route exige « coach » — " +
        "CapabilitiesGuard a-t-elle tourné avant l'AuthGuard ?",
    );
  });

  it("laisse passer le coach que l'AuthGuard a posé", () => {
    expect(guard.canActivate(contextWith({ isCoach: true, isAthlete: false }))).toBe(true);
  });
});
