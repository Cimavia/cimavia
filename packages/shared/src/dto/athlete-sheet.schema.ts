import { z } from "zod";

// Entrée : le coach édite le champ libre de la fiche athlète (coach seul — appliqué par le tenancy layer).
export const updateAthleteSheetSchema = z
  .object({
    content: z.string(),
  })
  .strict();

export type UpdateAthleteSheetInput = z.infer<typeof updateAthleteSheetSchema>;

// DTO de sortie.
export const athleteSheetDtoSchema = z.object({
  id: z.string(),
  athleteId: z.string(),
  coachId: z.string(),
  content: z.string(),
  updatedAt: z.iso.datetime(),
});

export type AthleteSheetDto = z.infer<typeof athleteSheetDtoSchema>;
