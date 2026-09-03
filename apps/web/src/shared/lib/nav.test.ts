import { type CounterpartsDto, UNKNOWN_COUNTERPARTS } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { itemsOfSpace, landingPath, NAV_ITEMS, SHARED_ROUTES, spaceOfPath } from "./nav";

const BOTH_SIDES: CounterpartsDto = { asCoach: true, asAthlete: true };
const NO_ONE: CounterpartsDto = { asCoach: false, asAthlete: false };
const ATHLETES_ONLY: CounterpartsDto = { asCoach: true, asAthlete: false };

const pathsOf = (space: "coach" | "athlete", counterparts: CounterpartsDto) =>
  itemsOfSpace(space, counterparts).map((item) => item.to);

describe("itemsOfSpace", () => {
  it("ne rend que les entrées de l'espace demandé", () => {
    expect(itemsOfSpace("coach", BOTH_SIDES).every((item) => item.capability === "coach")).toBe(
      true,
    );
    expect(itemsOfSpace("athlete", BOTH_SIDES).every((item) => item.capability === "athlete")).toBe(
      true,
    );
  });

  /**
   * Le cas de #198 : un compte qui se coache seul porte les deux capacités et n'a personne à qui
   * écrire. L'entrée s'affichait quand même, et menait à une liste dont la seule ligne était lui.
   */
  it("retire la messagerie de l'espace où personne n'est en face", () => {
    expect(pathsOf("coach", NO_ONE)).not.toContain("/messages");
    expect(pathsOf("athlete", NO_ONE)).not.toContain("/messages");
  });

  // Le signal est ventilé par espace, pas global : un coach qui a des athlètes et pas de coach
  // garde sa messagerie d'un côté et la perd de l'autre.
  it("tranche espace par espace, pas pour le compte entier", () => {
    expect(pathsOf("coach", ATHLETES_ONLY)).toContain("/messages");
    expect(pathsOf("athlete", ATHLETES_ONLY)).not.toContain("/messages");
  });

  it("laisse la messagerie dès qu'il y a quelqu'un en face", () => {
    expect(pathsOf("coach", BOTH_SIDES)).toContain("/messages");
    expect(pathsOf("athlete", BOTH_SIDES)).toContain("/messages");
  });

  // La contrepartie ne conditionne QUE ce qui la demande : le reste de la nav est inchangé, sinon
  // un compte sans athlète se retrouverait sans bibliothèque ni cycles.
  it("ne touche à aucune autre entrée", () => {
    for (const space of ["coach", "athlete"] as const) {
      const unconditional = NAV_ITEMS.filter(
        (item) => item.capability === space && item.requiresCounterpart !== true,
      ).map((item) => item.to);
      expect(pathsOf(space, NO_ONE)).toEqual(unconditional);
    }
  });

  /**
   * « Pas encore su » ne vaut jamais « absent » : sans cette constante, l'entrée disparaîtrait le
   * temps de chaque aller-retour au démarrage à froid.
   */
  it("montre tout sous le signal encore inconnu", () => {
    expect(pathsOf("coach", UNKNOWN_COUNTERPARTS)).toEqual(pathsOf("coach", BOTH_SIDES));
    expect(pathsOf("athlete", UNKNOWN_COUNTERPARTS)).toEqual(pathsOf("athlete", BOTH_SIDES));
  });
});

describe("landingPath", () => {
  it("mène à la première entrée de l'espace visé", () => {
    for (const space of ["coach", "athlete"] as const) {
      expect(landingPath(space, BOTH_SIDES)).toBe(itemsOfSpace(space, BOTH_SIDES)[0]?.to);
    }
  });

  /**
   * Aucune entrée de tête n'est conditionnelle aujourd'hui — l'atterrissage ne bouge donc pas quand
   * la messagerie disparaît. Le test fige ce fait plutôt que de le supposer : c'est lui qui
   * préviendra le jour où une entrée conditionnelle passera en tête de table.
   */
  it("ne bouge pas quand la messagerie disparaît", () => {
    expect(landingPath("coach", NO_ONE)).toBe(landingPath("coach", BOTH_SIDES));
    expect(landingPath("athlete", NO_ONE)).toBe(landingPath("athlete", BOTH_SIDES));
  });
});

describe("spaceOfPath", () => {
  it("range un chemin par son PRÉFIXE, pas par égalité", () => {
    expect(spaceOfPath("/library/exercises/42")).toBe("coach");
    expect(spaceOfPath("/sessions/12")).toBe("athlete");
  });

  it("traite la racine à part — tout chemin commence par elle", () => {
    expect(spaceOfPath("/")).toBe("coach");
  });

  /**
   * `null` et non « coach » : `/invoices` et `/messages` appartiennent aux deux espaces, seul `?as=`
   * tranche. Les confondre rangerait un compte à double capacité dans l'espace coach dès qu'il
   * ouvre ses factures d'athlète.
   */
  it("ne tranche pas pour une route partagée", () => {
    for (const shared of SHARED_ROUTES) {
      expect(spaceOfPath(shared)).toBeNull();
    }
  });

  it("rend null pour un chemin hors nav", () => {
    expect(spaceOfPath("/login")).toBeNull();
  });
});
