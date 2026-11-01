import { afterEach, describe, expect, it, vi } from "vitest";
import { purgeLegacyTracking } from "./legacy-tracking";

afterEach(() => {
  // Le getter d'abord rendu : un test qui l'a fait lever le ferait lever ici aussi.
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("purgeLegacyTracking", () => {
  it("efface le suivi par exercice et garde le suivi par bloc", () => {
    window.localStorage.setItem("cimavia-tracking:s-1", "{}");
    window.localStorage.setItem("cimavia-tracking:s-2", "{}");
    window.localStorage.setItem("cimavia-block-tracking:s-1", "{}");

    purgeLegacyTracking();

    expect(window.localStorage.getItem("cimavia-tracking:s-1")).toBeNull();
    expect(window.localStorage.getItem("cimavia-tracking:s-2")).toBeNull();
    expect(window.localStorage.getItem("cimavia-block-tracking:s-1")).toBe("{}");
  });

  it("ne bloque pas le démarrage quand le stockage est refusé", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("refusé", "SecurityError");
    });

    expect(() => purgeLegacyTracking()).not.toThrow();
  });
});
