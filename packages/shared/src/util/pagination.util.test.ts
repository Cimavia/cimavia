import { describe, expect, it } from "vitest";
import { HISTORY_PAGE_SIZE, pageOf } from "./pagination.util";

const ITEMS = ["a", "b", "c", "d", "e", "f", "g"];

describe("pageOf", () => {
  it("découpe à cinq par défaut, et situe la tranche dans le total", () => {
    expect(pageOf(ITEMS, 1)).toEqual({
      items: ["a", "b", "c", "d", "e"],
      page: 1,
      pageCount: 2,
      from: 1,
      to: 5,
      total: 7,
    });
  });

  it("la dernière page ne contient que ce qui reste", () => {
    expect(pageOf(ITEMS, 2)).toMatchObject({ items: ["f", "g"], from: 6, to: 7, total: 7 });
  });

  it("ramène dans les bornes une page trop grande, plutôt que de rendre un tableau vide", () => {
    // Supprimer le dernier élément d'une page 3 ne doit pas laisser le lecteur devant du vide.
    expect(pageOf(ITEMS, 9)).toMatchObject({ page: 2, items: ["f", "g"] });
  });

  it("ramène de même une page nulle ou négative", () => {
    expect(pageOf(ITEMS, 0).page).toBe(1);
    expect(pageOf(ITEMS, -3).page).toBe(1);
  });

  it("tronque une page fractionnaire au lieu de la refuser", () => {
    expect(pageOf(ITEMS, 2.7).page).toBe(2);
  });

  it("une liste vide a UNE page vide, pas zéro page — et des rangs à 0", () => {
    expect(pageOf([], 1)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      from: 0,
      to: 0,
      total: 0,
    });
  });

  it("accepte une autre taille de page", () => {
    expect(pageOf(ITEMS, 3, 2)).toMatchObject({ items: ["e", "f"], pageCount: 4, from: 5, to: 6 });
  });

  it("n'altère jamais la liste reçue", () => {
    const source = [...ITEMS];
    pageOf(source, 2);
    expect(source).toEqual(ITEMS);
  });

  it("cinq par page, taille commune aux historiques de la facturation et des cycles", () => {
    expect(HISTORY_PAGE_SIZE).toBe(5);
  });
});
