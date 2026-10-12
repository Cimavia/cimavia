import { describe, expect, it } from "vitest";
import type { AthleteSheetDto } from "../dto/athlete-sheet.schema";
import { athleteSheetDraft } from "./athlete-sheet.util";

describe("athleteSheetDraft", () => {
  it("part du contenu de la fiche, et cite sa version", () => {
    const sheet: AthleteSheetDto = {
      id: "sh_1",
      athleteId: "ath_1",
      coachId: "coach_1",
      content: "Épaule droite sensible.",
      updatedAt: "2026-09-30T08:00:00.000Z",
    };

    expect(athleteSheetDraft(sheet)).toEqual({
      content: "Épaule droite sensible.",
      expectedUpdatedAt: "2026-09-30T08:00:00.000Z",
    });
  });

  // `null` veut dire « aucune fiche vue » : l'API crée, et refuse s'il en existe déjà une.
  it("sur une fiche jamais écrite, part d'un champ vide sans version", () => {
    expect(athleteSheetDraft(null)).toEqual({ content: "", expectedUpdatedAt: null });
  });
});
