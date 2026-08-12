import { describe, expect, it } from "vitest";
import { megabytesOf, minutesOf } from "./media-format.util";

describe("megabytesOf", () => {
  it("convertit en mégaoctets binaires (1 Mo = 1024 Ko)", () => {
    expect(megabytesOf(100 * 1024 * 1024)).toBe(100);
    expect(megabytesOf(1000 * 1024 * 1024)).toBe(1000);
  });

  /**
   * Arrondi et non troncature : un plafond de 10,5 Mo annoncé « 10 Mo » ferait croire à un refus
   * en dessous de la limite réelle. C'est un ordre de grandeur pour un humain — la borne exacte
   * est signée dans l'URL d'upload et vérifiée par le storage.
   */
  it("arrondit plutôt que de tronquer", () => {
    expect(megabytesOf(10.6 * 1024 * 1024)).toBe(11);
    expect(megabytesOf(512 * 1024)).toBe(1);
  });
});

describe("minutesOf", () => {
  it("convertit les secondes en minutes", () => {
    expect(minutesOf(300)).toBe(5);
    expect(minutesOf(60)).toBe(1);
  });
});
