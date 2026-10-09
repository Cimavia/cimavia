import type { Capabilities } from "@cmv/shared";
import { BadRequestException, type ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import {
  ExercisesNoCapability,
  NO_CAPABILITY,
  RequireCapability,
  requiredCapabilityOf,
  resolveExercisedCapability,
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

const COACH: Capabilities = { isCoach: true, isAthlete: false, isCompany: false };
const ATHLETE: Capabilities = { isCoach: false, isAthlete: true, isCompany: false };
const BOTH: Capabilities = { isCoach: true, isAthlete: true, isCompany: false };

/**
 * Le titre sous lequel une route `"either"` est exercée décide de la colonne de scope : un `?as=`
 * mal formé doit être refusé même quand une seule capacité suffirait à répondre (#626 — le mutation
 * testing a montré que ce refus pouvait disparaître sans qu'aucun test ne le voie).
 */
describe("capacité exercée par une route", () => {
  it("une route sans titre n'en exerce aucun, une route à capacité unique impose la sienne", () => {
    expect(resolveExercisedCapability(null, BOTH, "coach")).toBeNull();
    expect(resolveExercisedCapability("coach", BOTH, "athlete")).toBe("coach");
  });

  it("?as= est honoré si le compte porte la capacité, refusé sinon", () => {
    expect(resolveExercisedCapability("either", BOTH, "athlete")).toBe("athlete");
    expect(() => resolveExercisedCapability("either", COACH, "athlete")).toThrow(
      ForbiddenException,
    );
  });

  it("une seule capacité s'impose quand ?as= est absent", () => {
    expect(resolveExercisedCapability("either", COACH, undefined)).toBe("coach");
    expect(resolveExercisedCapability("either", ATHLETE, undefined)).toBe("athlete");
  });

  it("un ?as= invalide est refusé, même quand une seule capacité suffirait", () => {
    const call = () => resolveExercisedCapability("either", COACH, "company");
    expect(call).toThrow(BadRequestException);
    expect(call).toThrow("as : « coach » ou « athlete » attendu");
  });

  it("deux capacités sans ?as= : 400, jamais un titre choisi par convention", () => {
    const call = () => resolveExercisedCapability("either", BOTH, undefined);
    expect(call).toThrow(BadRequestException);
    expect(call).toThrow(
      "as requis : ce compte porte les deux capacités, préciser « coach » ou « athlete »",
    );
  });
});
