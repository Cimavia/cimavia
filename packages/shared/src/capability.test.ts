import { describe, expect, it } from "vitest";
import {
  capabilitiesOf,
  hasCapability,
  SELECTABLE_CAPABILITIES,
  toggledCapability,
} from "./capability";
import { Role } from "./role";

const NONE = { isCoach: false, isAthlete: false };

describe("capabilitiesOf", () => {
  it("lit la capacité coach", () => {
    expect(capabilitiesOf({ isCoach: true, isAthlete: false })).toEqual({
      isCoach: true,
      isAthlete: false,
    });
  });

  it("lit la capacité athlète", () => {
    expect(capabilitiesOf({ isCoach: false, isAthlete: true })).toEqual({
      isCoach: false,
      isAthlete: true,
    });
  });

  /**
   * Le cas que #7 rend possible et que le rôle exclusif ne produisait jamais : un coach qui se
   * coache lui-même. Les deux drapeaux sortent vrais ensemble.
   */
  it("rend les deux capacités d'un compte qui cumule", () => {
    expect(capabilitiesOf({ isCoach: true, isAthlete: true })).toEqual({
      isCoach: true,
      isAthlete: true,
    });
  });

  /**
   * Fail closed : c'est la propriété qui rend cette fonction utilisable comme garde. Une session en
   * cours de chargement rend `undefined` côté Better Auth — si l'absence ouvrait quoi que ce soit,
   * chaque écran gardé clignoterait une fraction de seconde avant de se refermer.
   */
  it("n'accorde aucune capacité sans utilisateur", () => {
    expect(capabilitiesOf(null)).toEqual(NONE);
    expect(capabilitiesOf(undefined)).toEqual(NONE);
  });

  /**
   * Un client déployé avant #9 ne déclare pas ces champs en `additionalFields`, donc la session ne
   * les porte pas. Absents ≠ faux du point de vue du transport, identiques du point de vue du
   * droit : rien.
   */
  it("n'accorde aucune capacité quand les champs sont absents", () => {
    expect(capabilitiesOf({})).toEqual(NONE);
    expect(capabilitiesOf({ isCoach: null, isAthlete: null })).toEqual(NONE);
  });

  /**
   * La valeur traverse une frontière HTTP non typée. Seul un booléen vrai ouvre : c'est ce que
   * garantit le `=== true`, là où un `?? false` aurait laissé passer `"false"` — une chaîne non
   * vide est *truthy*, donc un JSON mal sérialisé aurait accordé la capacité.
   */
  it("n'accorde aucune capacité sur une valeur qui n'est pas un booléen vrai", () => {
    expect(capabilitiesOf({ isCoach: "true" } as never)).toEqual(NONE);
    expect(capabilitiesOf({ isCoach: "false" } as never)).toEqual(NONE);
    expect(capabilitiesOf({ isCoach: 1 } as never)).toEqual(NONE);
  });

  /**
   * Le verrou de #9 : `role` survit sur `User` comme persona d'affichage, et ne fonde plus AUCUN
   * droit. Un compte qui porterait encore `role: COACH` sans la capacité — un compte échappé à la
   * migration, ou dont la capacité vient d'être retirée en réglages (#13) — n'obtient rien.
   */
  it("ignore role, qui ne fonde plus aucun droit", () => {
    expect(capabilitiesOf({ role: Role.COACH } as never)).toEqual(NONE);
    expect(capabilitiesOf({ role: Role.COACH, isAthlete: true } as never)).toEqual({
      isCoach: false,
      isAthlete: true,
    });
  });
});

describe("hasCapability", () => {
  it("répond à une exigence nommée", () => {
    const coach = capabilitiesOf({ isCoach: true });
    expect(hasCapability(coach, "coach")).toBe(true);
    expect(hasCapability(coach, "athlete")).toBe(false);

    const athlete = capabilitiesOf({ isAthlete: true });
    expect(hasCapability(athlete, "athlete")).toBe(true);
    expect(hasCapability(athlete, "coach")).toBe(false);
  });

  // Sans capacité, aucune exigence n'est satisfaite : c'est ce qui fait qu'une navigation dérivée
  // de cette fonction est VIDE pour un compte non résolu, jamais complète « par défaut ».
  it("ne satisfait aucune exigence sans capacité", () => {
    const none = capabilitiesOf(null);
    expect(hasCapability(none, "coach")).toBe(false);
    expect(hasCapability(none, "athlete")).toBe(false);
  });

  // Les deux capacités se lisent INDÉPENDAMMENT sur le même compte — le cas que #7 rend courant.
  it("satisfait les deux exigences d'un compte à double capacité", () => {
    const both = capabilitiesOf({ isCoach: true, isAthlete: true });
    expect(hasCapability(both, "coach")).toBe(true);
    expect(hasCapability(both, "athlete")).toBe(true);
  });
});

describe("toggledCapability", () => {
  it("ajoute ce qui manque et retire ce qui est là", () => {
    const athleteOnly = new Set<"coach" | "athlete">(["athlete"]);

    expect([...toggledCapability(athleteOnly, "coach")]).toEqual(["athlete", "coach"]);
    expect([...toggledCapability(athleteOnly, "athlete")]).toEqual([]);
  });

  /**
   * Un nouvel ensemble à chaque fois, jamais l'ancien muté : React compare par référence, et une
   * mutation en place laisserait la case cochée à l'écran sans que rien ne redessine.
   */
  it("ne touche jamais l'ensemble reçu", () => {
    const current = new Set<"coach" | "athlete">(["athlete"]);

    const next = toggledCapability(current, "coach");

    expect(next).not.toBe(current);
    expect([...current]).toEqual(["athlete"]);
  });
});

describe("SELECTABLE_CAPABILITIES", () => {
  // Les deux capacités, dans l'ordre d'affichage, et leur libellé traduit — pas une chaîne en dur.
  it("propose coach puis athlète, chacune avec sa clé i18n", () => {
    expect(SELECTABLE_CAPABILITIES.map((capability) => capability.name)).toEqual([
      "coach",
      "athlete",
    ]);
    expect(
      SELECTABLE_CAPABILITIES.every(({ labelKey }) => labelKey.startsWith("auth.register.")),
    ).toBe(true);
  });
});
