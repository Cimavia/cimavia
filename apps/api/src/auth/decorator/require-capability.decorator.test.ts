import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import {
  ExercisesNoCapability,
  NO_CAPABILITY,
  RequireCapability,
  requiredCapabilityOf,
  routeDeclarationOf,
} from "./require-capability.decorator";

@RequireCapability("coach")
class CoachController {
  list() {}

  @ExercisesNoCapability()
  counterparts() {}
}

class BareController {
  list() {}
}

function contextOf(cls: abstract new () => unknown, handler: () => void): ExecutionContext {
  return { getHandler: () => handler, getClass: () => cls } as unknown as ExecutionContext;
}

/**
 * « Non déclaré » et « sans titre » donnent la même exigence et le même scope, mais seule la
 * déclaration permet de les distinguer : c'est ce que lit le test d'énumération des routes (#622).
 */
describe("déclaration de capacité d'une route", () => {
  const reflector = new Reflector();

  it("une route sans décorateur ne déclare rien", () => {
    const context = contextOf(BareController, BareController.prototype.list);
    expect(routeDeclarationOf(reflector, context)).toBeNull();
    expect(requiredCapabilityOf(reflector, context)).toBeNull();
  });

  it("la capacité du contrôleur vaut pour ses routes", () => {
    const context = contextOf(CoachController, CoachController.prototype.list);
    expect(routeDeclarationOf(reflector, context)).toBe("coach");
    expect(requiredCapabilityOf(reflector, context)).toBe("coach");
  });

  it("une route sans titre remplace la capacité du contrôleur, et n'exige plus rien", () => {
    const context = contextOf(CoachController, CoachController.prototype.counterparts);
    expect(routeDeclarationOf(reflector, context)).toBe(NO_CAPABILITY);
    expect(requiredCapabilityOf(reflector, context)).toBeNull();
  });
});
