import { describe, expect, it } from "vitest";
import { erasureNotices } from "./account-erasure.util";

const NONE = { isCoach: false, isAthlete: false, isCompany: false };

describe("erasureNotices", () => {
  it.each([
    ["un coach", { ...NONE, isCoach: true }, ["coach"], ["coach"]],
    ["un athlète", { ...NONE, isAthlete: true }, ["athlete"], ["athlete"]],
    [
      "un compte aux deux capacités",
      { ...NONE, isCoach: true, isAthlete: true },
      ["coach", "athlete"],
      ["coach", "athlete"],
    ],
    // Ni facture émise, ni exercice : rien de l'Entreprise ne survit chez quelqu'un d'autre.
    ["une entreprise", { ...NONE, isCompany: true }, ["company"], []],
    ["un compte sans capacité", NONE, [], []],
  ])("annonce à %s ce qui part et ce qui reste", (_who, capabilities, gone, kept) => {
    expect(erasureNotices(capabilities)).toEqual({ gone, kept });
  });
});
