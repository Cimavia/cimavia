import { describe, expect, it } from "vitest";
import { asyncStorageMock, storedItems } from "../../test/setup";
import { purgeLegacyTracking } from "./legacy-tracking";

describe("purgeLegacyTracking", () => {
  it("efface le suivi par exercice et le drapeau de son astuce", async () => {
    storedItems.set("cimavia-tracking:s-1", "{}");
    storedItems.set("cimavia-tracking:s-2", "{}");
    storedItems.set("cimavia-tracking-hint-seen", "1");

    await purgeLegacyTracking();

    expect([...storedItems.keys()]).toEqual([]);
  });

  it("garde le suivi par bloc et le reste de l'appareil", async () => {
    storedItems.set("cimavia-block-tracking:s-1", "{}");
    storedItems.set("cimavia-query-cache", "{}");

    await purgeLegacyTracking();

    expect([...storedItems.keys()]).toEqual(["cimavia-block-tracking:s-1", "cimavia-query-cache"]);
    expect(asyncStorageMock.multiRemove).not.toHaveBeenCalled();
  });
});
