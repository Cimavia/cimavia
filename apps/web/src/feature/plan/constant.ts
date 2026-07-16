import { PlanWeekType } from "@cmv/shared";

// Ordre d'affichage des types de semaine (les libellés passent par i18n).
export const PLAN_WEEK_TYPES = [PlanWeekType.TRAINING, PlanWeekType.DELOAD] as const;

// Un cycle démarre à 4 semaines : le coach en ajoute ou en retire ensuite (nombre libre).
export const DEFAULT_WEEK_COUNT = 4;
