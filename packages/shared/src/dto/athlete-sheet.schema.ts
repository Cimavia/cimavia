import { z } from "zod";

// Le double des autres textes longs (débrief, notes de séance : 5 000) : une fiche se tient sur des
// mois, là où un débrief dit une séance (#354).
export const ATHLETE_SHEET_CONTENT_MAX_LENGTH = 10_000;

/**
 * Entrée : le coach édite le champ libre de la fiche athlète (coach seul — appliqué par le tenancy
 * layer).
 *
 * `expectedUpdatedAt` est la version de la fiche sur laquelle la saisie a COMMENCÉ (#440) : l'API
 * refuse en 409 si la fiche a changé depuis. `null` veut dire « je n'ai vu aucune fiche », pas « je
 * ne sais pas » — d'où un champ requis : un client qui l'oublierait retomberait dans l'écrasement
 * silencieux que cette garde ferme.
 */
export const updateAthleteSheetSchema = z
  .object({
    content: z.string().max(ATHLETE_SHEET_CONTENT_MAX_LENGTH),
    expectedUpdatedAt: z.iso.datetime().nullable(),
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
