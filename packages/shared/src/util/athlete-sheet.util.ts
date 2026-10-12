import type { AthleteSheetDto, UpdateAthleteSheetInput } from "../dto/athlete-sheet.schema";

/**
 * Le brouillon qu'ouvre une fiche : son contenu, et la version que l'enregistrement citera (#440) —
 * `null` quand le coach n'a vu aucune fiche, et en crée une.
 *
 * Le web et le mobile le prennent au DÉBUT de la saisie et ne le recalculent plus : la version citée
 * est celle que le coach a lue, pas celle qu'une relecture a rangée en cache depuis.
 */
export function athleteSheetDraft(sheet: AthleteSheetDto | null): UpdateAthleteSheetInput {
  return { content: sheet?.content ?? "", expectedUpdatedAt: sheet?.updatedAt ?? null };
}
