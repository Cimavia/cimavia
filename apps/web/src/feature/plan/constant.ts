import { DAYS_PER_WEEK, PlanWeekType, shiftIsoDate } from "@cmv/shared";

// Ordre d'affichage des types de semaine (les libellés passent par i18n).
export const PLAN_WEEK_TYPES = [PlanWeekType.TRAINING, PlanWeekType.DELOAD] as const;

// Un cycle démarre à 4 semaines : le coach en ajoute ou en retire ensuite (nombre libre).
export const DEFAULT_WEEK_COUNT = 4;

// Les 7 jours (lundi → dimanche) d'une semaine de cycle, à partir de son lundi.
// Les bornes viennent de l'API (planWeekRange) ; ici on ne fait que dérouler les jours.
export function weekDays(weekStartDate: string): string[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
    const day = shiftIsoDate(weekStartDate, index);
    if (day == null) {
      throw new Error(`[plan] semaine illisible : ${weekStartDate}`);
    }
    return day;
  });
}
