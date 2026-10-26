import { describe, expect, it } from "vitest";
import { LibraryTab, librarySearchOf } from "./library-tab.util";

describe("librarySearchOf", () => {
  it("garde les onglets Séances et Structures", () => {
    expect(librarySearchOf({ tab: LibraryTab.SESSIONS })).toEqual({ tab: "sessions" });
    expect(librarySearchOf({ tab: LibraryTab.STRUCTURES })).toEqual({ tab: "structures" });
  });

  it("n'écrit pas l'onglet par défaut, et ignore une valeur inconnue", () => {
    expect(librarySearchOf({ tab: LibraryTab.EXERCISES })).toEqual({});
    expect(librarySearchOf({ tab: "autre" })).toEqual({});
    expect(librarySearchOf({})).toEqual({});
  });
});
