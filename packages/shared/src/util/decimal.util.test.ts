import { describe, expect, it } from "vitest";
import { decimalPlaces, formatDecimal, parseDecimal } from "./decimal.util";

describe("parseDecimal", () => {
  it.each([
    ["12", 12],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["  12,5  ", 12.5],
    [",5", 0.5],
    ["0,5", 0.5],
    ["12,", 12],
    ["-2,5", -2.5],
    ["0", 0],
  ])("interprète %s", (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it("lit le point comme un séparateur décimal, jamais comme un séparateur de milliers", () => {
    expect(parseDecimal("1.500")).toBe(1.5);
  });

  it.each([
    ["abc", "du texte"],
    ["", "une chaîne vide"],
    ["   ", "des espaces"],
    ["12,5,3", "deux séparateurs"],
    ["12 5", "une espace au milieu"],
    ["1e3", "une écriture exponentielle"],
    ["0x10", "de l'hexadécimal"],
    ["Infinity", "l'infini"],
    ["-", "un signe seul"],
    [",", "un séparateur seul"],
  ])("refuse %s — %s", (input) => {
    expect(parseDecimal(input)).toBeNull();
  });

  it("refuse une saisie absente", () => {
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });
});

describe("formatDecimal", () => {
  it("écrit le séparateur de la langue du lecteur", () => {
    expect(formatDecimal(12.5, "fr")).toBe("12,5");
    expect(formatDecimal(12.5, "en")).toBe("12.5");
  });

  it("n'ajoute aucun séparateur de milliers, pour que l'écriture se ressaisisse telle quelle", () => {
    expect(formatDecimal(1500, "fr")).toBe("1500");
    expect(parseDecimal(formatDecimal(1500.25, "fr"))).toBe(1500.25);
  });

  it("rend le nombre exact, sans l'arrondir à trois décimales", () => {
    expect(formatDecimal(0.1234, "fr")).toBe("0,1234");
  });

  it("écrit un entier sans décimale", () => {
    expect(formatDecimal(12, "fr")).toBe("12");
    expect(formatDecimal(-2.5, "fr")).toBe("-2,5");
  });
});

describe("decimalPlaces", () => {
  it.each([
    [12, 0],
    [12.5, 1],
    [0.25, 2],
    [-2.125, 3],
  ])("compte les décimales de %s", (value, expected) => {
    expect(decimalPlaces(value)).toBe(expected);
  });

  it("ne compte pas une écriture exponentielle", () => {
    expect(decimalPlaces(1e-7)).toBeNull();
  });
});
