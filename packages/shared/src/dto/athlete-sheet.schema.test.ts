import { describe, expect, it } from "vitest";
import { athleteSheetDtoSchema, updateAthleteSheetSchema } from "./athlete-sheet.schema";

describe("updateAthleteSheetSchema", () => {
  const READ_AT = "2026-09-30T08:00:00.000Z";

  // Une fiche vidée est une édition légitime, pas une saisie manquante.
  it("accepte un contenu, même vide", () => {
    expect(
      updateAthleteSheetSchema.safeParse({
        content: "Tendinite à surveiller",
        expectedUpdatedAt: READ_AT,
      }).success,
    ).toBe(true);
    expect(
      updateAthleteSheetSchema.safeParse({ content: "", expectedUpdatedAt: READ_AT }).success,
    ).toBe(true);
  });

  it("exige le contenu", () => {
    expect(updateAthleteSheetSchema.safeParse({ expectedUpdatedAt: READ_AT }).success).toBe(false);
  });

  // `null` : le coach n'a vu aucune fiche et en crée une.
  it("accepte une première fiche, écrite sans version lue", () => {
    expect(
      updateAthleteSheetSchema.safeParse({ content: "x", expectedUpdatedAt: null }).success,
    ).toBe(true);
  });

  /**
   * Requise, pas optionnelle (#440) : un client qui ne dit pas quelle version il a lue n'est pas un
   * client qui n'en a vu aucune. L'accepter rouvrirait l'écrasement silencieux.
   */
  it("exige la version lue", () => {
    expect(updateAthleteSheetSchema.safeParse({ content: "x" }).success).toBe(false);
  });

  it("refuse une version lue qui n'est pas un horodatage ISO", () => {
    expect(
      updateAthleteSheetSchema.safeParse({ content: "x", expectedUpdatedAt: "30/09/2026" }).success,
    ).toBe(false);
  });

  /**
   * Strict : le client n'envoie QUE le contenu et la version lue. Les champs de tenant (`coachId`, `athleteId`) sont
   * posés par le serveur ; les laisser passer ouvrirait une porte à les réécrire.
   */
  it("refuse un champ de tenant glissé dans la requête", () => {
    expect(
      updateAthleteSheetSchema.safeParse({
        content: "x",
        expectedUpdatedAt: READ_AT,
        coachId: "autre",
      }).success,
    ).toBe(false);
  });
});

describe("athleteSheetDtoSchema", () => {
  const sheet = {
    id: "sh_1",
    athleteId: "ath_1",
    coachId: "coach_1",
    content: "Notes",
    updatedAt: "2026-09-30T08:00:00.000Z",
  };

  it("valide la fiche telle que l'API la renvoie", () => {
    expect(athleteSheetDtoSchema.parse(sheet)).toEqual(sheet);
  });

  it("refuse une date de mise à jour qui n'est pas un horodatage ISO", () => {
    expect(athleteSheetDtoSchema.safeParse({ ...sheet, updatedAt: "30/09/2026" }).success).toBe(
      false,
    );
  });
});
