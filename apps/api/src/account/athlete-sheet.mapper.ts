import type { AthleteSheetDto } from "@cmv/shared";
import type { AthleteSheet } from "@prisma/client";

export function toAthleteSheetDto(sheet: AthleteSheet): AthleteSheetDto {
  return {
    id: sheet.id,
    athleteId: sheet.athleteId,
    coachId: sheet.coachId,
    content: sheet.content,
    updatedAt: sheet.updatedAt.toISOString(),
  };
}
