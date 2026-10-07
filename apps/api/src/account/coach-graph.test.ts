import { describe, expect, it } from "vitest";
import { hasCoachCycle } from "./coach-graph";

const graph = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

/**
 * La détection de boucle dans le graphe des coachs (#599). Le test qui compte est le losange :
 * c'est lui qu'une remontée à simple ensemble de visités, celle de #11, aurait pris pour un cycle.
 */
describe("hasCoachCycle", () => {
  it("ne voit rien dans un graphe vide", () => {
    expect(hasCoachCycle(new Map())).toBe(false);
  });

  it("ne voit rien dans une chaîne linéaire", () => {
    expect(hasCoachCycle(graph({ a: ["b"], b: ["c"], c: [] }))).toBe(false);
  });

  // A suivi par B et C, tous deux suivis par D : D est atteint deux fois, sans boucle.
  it("ne prend pas un losange pour une boucle", () => {
    expect(hasCoachCycle(graph({ a: ["b", "c"], b: ["d"], c: ["d"], d: [] }))).toBe(false);
  });

  it("voit la boucle d'une chaîne refermée", () => {
    expect(hasCoachCycle(graph({ a: ["b"], b: ["c"], c: ["a"] }))).toBe(true);
  });

  // La boucle n'est pas sur le premier chemin descendu : le parcours doit continuer après lui.
  it("voit une boucle derrière une branche saine", () => {
    expect(hasCoachCycle(graph({ a: ["b", "c"], b: [], c: ["d"], d: ["c"] }))).toBe(true);
  });

  // Un coach cité sans clé n'a pas été chargé : il n'a pas de coachs connus, et ne boucle pas.
  it("tient un coach cité mais absent des clés pour une feuille", () => {
    expect(hasCoachCycle(graph({ a: ["b"] }))).toBe(false);
  });
});
