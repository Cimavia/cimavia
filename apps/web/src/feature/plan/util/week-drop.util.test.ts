import { describe, expect, it } from "vitest";
import { dayAfterDrop } from "./week-drop.util";

const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";

const day = (...ids: string[]) => ids.map((id) => ({ id }));

describe("dayAfterDrop", () => {
  describe("dans la même journée", () => {
    const monday = day("a", "b", "c");

    it("insère à la place visée en poussant le reste", () => {
      const result = dayAfterDrop(
        monday,
        monday,
        { date: MONDAY, index: 2 },
        { date: MONDAY, index: 0 },
      );

      expect(result).toEqual({ date: MONDAY, sessionIds: ["c", "a", "b"] });
    });

    /**
     * Le retrait avant l'insertion : sans lui, descendre « a » d'un cran le laisserait en tête,
     * son propre rang comptant encore dans les places qui le précèdent.
     */
    it("descend d'un cran sans se compter soi-même", () => {
      const result = dayAfterDrop(
        monday,
        monday,
        { date: MONDAY, index: 0 },
        { date: MONDAY, index: 1 },
      );

      expect(result?.sessionIds).toEqual(["b", "a", "c"]);
    });

    // Rien à écrire : sur un cycle diffusé, ce serait une notification pour un geste sans effet.
    it("ne rend rien quand la séance est déposée sur elle-même", () => {
      expect(
        dayAfterDrop(monday, monday, { date: MONDAY, index: 1 }, { date: MONDAY, index: 1 }),
      ).toBeNull();
    });

    /**
     * `splice` compte les indices NÉGATIFS depuis la fin : sans borne, monter la première séance
     * visait `-1` et la déplaçait en avant-dernière place. Descendre la dernière visait `length`
     * et l'y remettait — sans effet, mais en écrivant.
     */
    it("ne rend rien quand le cran demandé sort de la journée", () => {
      expect(
        dayAfterDrop(monday, monday, { date: MONDAY, index: 0 }, { date: MONDAY, index: -1 }),
      ).toBeNull();
      expect(
        dayAfterDrop(monday, monday, { date: MONDAY, index: 2 }, { date: MONDAY, index: 3 }),
      ).toBeNull();
    });
  });

  describe("d'un jour à l'autre", () => {
    /**
     * Une SEULE journée est rendue — celle d'arrivée. Le serveur retire la séance de son jour
     * d'origine et l'y recolle : renvoyer aussi le départ ferait deux écritures, donc deux
     * notifications pour un seul geste.
     */
    it("ne rend que la journée d'arrivée, la séance insérée au rang visé", () => {
      const result = dayAfterDrop(
        day("a", "b"),
        day("x", "y"),
        { date: MONDAY, index: 1 },
        { date: TUESDAY, index: 1 },
      );

      expect(result).toEqual({ date: TUESDAY, sessionIds: ["x", "b", "y"] });
    });

    // Le cas le plus courant du geste : la case vide n'a aucune carte à viser, le dépôt tombe sur
    // sa fin de file — qui est aussi son début.
    it("accueille dans une journée vide", () => {
      const result = dayAfterDrop(
        day("a"),
        [],
        { date: MONDAY, index: 0 },
        { date: TUESDAY, index: 0 },
      );

      expect(result).toEqual({ date: TUESDAY, sessionIds: ["a"] });
    });

    it("pose en fin de file quand le dépôt vise l'espace libre de la case", () => {
      const result = dayAfterDrop(
        day("a"),
        day("x", "y"),
        { date: MONDAY, index: 0 },
        { date: TUESDAY, index: 2 },
      );

      expect(result?.sessionIds).toEqual(["x", "y", "a"]);
    });
  });

  // Un glisser dont l'origine a disparu entre-temps (le cache s'est rafraîchi pendant le geste)
  // ne doit rien écrire plutôt que d'inventer une journée.
  it("ne rend rien quand la séance glissée n'est plus là", () => {
    expect(
      dayAfterDrop(day("a"), day("x"), { date: MONDAY, index: 5 }, { date: TUESDAY, index: 0 }),
    ).toBeNull();
  });
});
