import { describe, expect, it } from "vitest";
import { storedItems } from "../../../test/setup";
import { blockTrackingStore } from "./local-tracking-store";

const KEY = "cimavia-block-tracking:s-1";
const TRACKING = { "b-1": { checked: [{ row: 0, key: "a1" }] } };

/**
 * Ce que le hook ne laisse pas atteindre : il n'écrit qu'abonné. Le magasin, lui, doit tenir sans
 * lecteur.
 */
describe("local-tracking-store", () => {
  // Personne ne lit la séance : rien ne s'installe en mémoire, mais le disque est à jour.
  it("écrit sur le disque même sans lecteur, sans rien garder en mémoire", () => {
    blockTrackingStore.write("s-1", TRACKING);

    expect(JSON.parse(storedItems.get(KEY) ?? "null")).toEqual(TRACKING);
    expect(blockTrackingStore.read("s-1")).toBeNull();
  });

  // Le préfixe est la frontière : le stockage porte aussi ce qui n'appartient pas au compte parti.
  it("purge tout le magasin, et rien d'autre", async () => {
    blockTrackingStore.write("s-1", TRACKING);
    blockTrackingStore.write("s-2", TRACKING);
    storedItems.set("cimavia-block-tracking-autre:s-1", "garde");
    storedItems.set("cimavia-theme", "garde");

    await blockTrackingStore.purge();

    expect([...storedItems.keys()].sort()).toEqual([
      "cimavia-block-tracking-autre:s-1",
      "cimavia-theme",
    ]);
  });

  it("ne touche à rien quand le magasin est vide", async () => {
    storedItems.set("cimavia-theme", "garde");

    await blockTrackingStore.purge();

    expect(storedItems.get("cimavia-theme")).toBe("garde");
  });
});
