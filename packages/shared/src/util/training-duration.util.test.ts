import { describe, expect, it } from "vitest";
import {
  formatTrainingDuration,
  parseTrainingDuration,
  TRAINING_DURATION_MAX_SECONDS,
} from "./training-duration.util";

describe("parseTrainingDuration", () => {
  it.each([
    ["150", 150],
    ["2:30", 150],
    ["2m30", 150],
    ["2min30", 150],
    ["2'30", 150],
    ["  2'30  ", 150],
    ["2'", 120],
    ["3:00", 180],
    ["30s", 30],
    ["30 s", 30],
    ["0", 0],
  ])("interprète %s", (input, expected) => {
    expect(parseTrainingDuration(input)).toBe(expected);
  });

  it("compte un nombre nu en SECONDES, jamais en minutes", () => {
    expect(parseTrainingDuration("90")).toBe(90);
  });

  it.each([
    ["2:75", "des secondes au-delà de 59"],
    ["abc", "du texte"],
    ["", "une chaîne vide"],
    ["-30", "une durée négative"],
    ["2h30", "une unité non gérée"],
  ])("refuse %s — %s", (input) => {
    expect(parseTrainingDuration(input)).toBeNull();
  });

  it("refuse une durée absente", () => {
    expect(parseTrainingDuration(null)).toBeNull();
    expect(parseTrainingDuration(undefined)).toBeNull();
  });

  it("refuse au-delà du plafond de 24 h", () => {
    expect(parseTrainingDuration(String(TRAINING_DURATION_MAX_SECONDS))).toBe(
      TRAINING_DURATION_MAX_SECONDS,
    );
    expect(parseTrainingDuration(String(TRAINING_DURATION_MAX_SECONDS + 1))).toBeNull();
  });
});

describe("formatTrainingDuration", () => {
  it.each([
    [45, "45 s"],
    [30, "30 s"],
    [0, "0 s"],
    [180, "3'"],
    [60, "1'"],
    [150, "2'30"],
    [125, "2'05"],
  ])("rend %s secondes en %s", (seconds, expected) => {
    expect(formatTrainingDuration(seconds)).toBe(expected);
  });

  it("rend null sur une durée absente — jamais « 0 s »", () => {
    expect(formatTrainingDuration(null)).toBeNull();
    expect(formatTrainingDuration(undefined)).toBeNull();
  });

  it("fait l'aller-retour avec la saisie tolérante", () => {
    for (const input of ["150", "2:30", "2m30", "2'30"]) {
      expect(formatTrainingDuration(parseTrainingDuration(input))).toBe("2'30");
    }
  });
});
