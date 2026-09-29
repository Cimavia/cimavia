import { describe, expect, it } from "vitest";
import { storedItems } from "../../../test/setup";
import { readLocalTracking, writeLocalTracking } from "./local-tracking-store";

const KEY = "cimavia-tracking:s-1";
const TRACKING = { "ex-1": { "b-1": { checked: [0] } } };

/**
 * Ce que le hook ne laisse pas atteindre : il n'écrit qu'abonné. Le magasin, lui, doit tenir sans
 * lecteur.
 */
describe("local-tracking-store", () => {
  // Personne ne lit la séance : rien ne s'installe en mémoire, mais le disque est à jour.
  it("écrit sur le disque même sans lecteur, sans rien garder en mémoire", () => {
    writeLocalTracking("s-1", TRACKING);

    expect(JSON.parse(storedItems.get(KEY) ?? "null")).toEqual(TRACKING);
    expect(readLocalTracking("s-1")).toBeNull();
  });
});
