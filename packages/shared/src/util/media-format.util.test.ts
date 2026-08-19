import { describe, expect, it } from "vitest";
import { formatMediaDuration, formatMmSs, megabytesOf, minutesOf } from "./media-format.util";

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

describe("formatMmSs", () => {
  it("formate en « m:ss » avec les secondes sur deux chiffres", () => {
    expect(formatMmSs(0)).toBe("0:00");
    expect(formatMmSs(5)).toBe("0:05");
    expect(formatMmSs(65)).toBe("1:05");
    expect(formatMmSs(180)).toBe("3:00");
  });

  it("tronque les fractions de seconde", () => {
    expect(formatMmSs(65.9)).toBe("1:05");
  });

  /**
   * Le compteur d'un lecteur peut passer sous zéro sur une position rapportée avant le premier
   * échantillon : « -1:-1 » à l'écran serait pire que « 0:00 ».
   */
  it("plancher à zéro sur une valeur négative", () => {
    expect(formatMmSs(-3)).toBe("0:00");
  });
});

describe("formatMediaDuration", () => {
  it("formate une durée connue", () => {
    expect(formatMediaDuration(42)).toBe("0:42");
  });

  /**
   * Le cœur de la règle nullable : une durée absente ne devient JAMAIS « 0:00 ». C'est ce qui
   * faisait afficher « Vidéo · 0 s » à la galerie de débrief sur un média sans durée déclarée.
   */
  it("rend `null` sur une durée inconnue plutôt qu'un zéro", () => {
    expect(formatMediaDuration(null)).toBeNull();
    expect(formatMediaDuration(undefined)).toBeNull();
  });

  it("distingue une durée nulle d'une durée inconnue", () => {
    expect(formatMediaDuration(0)).toBe("0:00");
  });
});
