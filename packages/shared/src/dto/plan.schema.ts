import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import { isMondayIsoDate } from "../util/date.util";
import {
  EXERCISE_DESCRIPTION_MAX_LENGTH,
  EXERCISE_TITLE_MAX_LENGTH,
  exerciseCategorySchema,
  exerciseDocumentDtoSchema,
} from "./exercise.schema";
import {
  SESSION_NOTES_MAX_LENGTH,
  SESSION_PRESCRIPTION_MAX_LENGTH,
  SESSION_TITLE_MAX_LENGTH,
} from "./session.schema";

export const PLAN_TITLE_MAX_LENGTH = 200;
export const PLAN_DESCRIPTION_MAX_LENGTH = 5000;
export const PLAN_WEEK_NOTE_MAX_LENGTH = 1000;
// Le nombre de semaines est LIBRE (CDC §5.4) ; ce plafond n'est qu'un garde-fou (un cycle
// d'entraînement ne dure pas 10 ans) qui borne aussi le coût d'une création de plan.
export const PLAN_MAX_WEEKS = 52;

// Cycle de vie d'une planification. DRAFT : en construction, invisible de l'athlète.
// PUBLISHED : diffusée → l'athlète la voit, notification envoyée. Pas de retour arrière en MVP.
export const PlanStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
} as const;
export type PlanStatus = TypesValuesOf<typeof PlanStatus>;
export const planStatusSchema = z.enum(PlanStatus);

export const PlanWeekType = {
  TRAINING: "TRAINING",
  DELOAD: "DELOAD",
} as const;
export type PlanWeekType = TypesValuesOf<typeof PlanWeekType>;
export const planWeekTypeSchema = z.enum(PlanWeekType);

// Statut d'une séance planifiée. En P3, toute séance est créée PLANNED et le reste : la
// transition vers DONE arrive avec le débrief (P4), SKIPPED avec l'ajustement de cycle.
export const ScheduledSessionStatus = {
  PLANNED: "PLANNED",
  DONE: "DONE",
  SKIPPED: "SKIPPED",
} as const;
export type ScheduledSessionStatus = TypesValuesOf<typeof ScheduledSessionStatus>;
export const scheduledSessionStatusSchema = z.enum(ScheduledSessionStatus);

// Un plan démarre un LUNDI : la contrainte vit dans le schéma (appliquée par le pipe → 400,
// et réutilisable par le client pour n'offrir que des lundis au choix). Sans elle, la plage
// d'une semaine (planWeekRange) ne correspondrait plus à un lundi→dimanche affichable.
export const planStartDateSchema = z.iso.date().refine(isMondayIsoDate, {
  message: "La date de début doit être un lundi",
});

// ── Entrées coach ────────────────────────────────────────────────────────────

export const planWeekInputSchema = z
  .object({
    type: planWeekTypeSchema,
    note: z.string().max(PLAN_WEEK_NOTE_MAX_LENGTH).nullable().optional(),
  })
  .strict();
export type PlanWeekInput = z.infer<typeof planWeekInputSchema>;

export const createPlanSchema = z
  .object({
    athleteId: z.string().min(1),
    title: z.string().min(1).max(PLAN_TITLE_MAX_LENGTH),
    description: z.string().max(PLAN_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    startDate: planStartDateSchema,
    // Semaines initiales du cycle ; d'autres s'ajoutent ensuite une à une.
    weeks: z.array(planWeekInputSchema).max(PLAN_MAX_WEEKS).default([]),
  })
  .strict();
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

// Déplacer `startDate` décale le cycle entier : l'API translate les dates des séances de la
// même durée (l'invariant « une séance tombe dans sa semaine » est ainsi préservé).
export const updatePlanSchema = z
  .object({
    title: z.string().min(1).max(PLAN_TITLE_MAX_LENGTH).optional(),
    description: z.string().max(PLAN_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    startDate: planStartDateSchema.optional(),
  })
  .strict();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const updatePlanWeekSchema = z
  .object({
    type: planWeekTypeSchema.optional(),
    note: z.string().max(PLAN_WEEK_NOTE_MAX_LENGTH).nullable().optional(),
  })
  .strict();
export type UpdatePlanWeekInput = z.infer<typeof updatePlanWeekSchema>;

// Exercice d'une séance planifiée : une COPIE (titre/description/catégorie), pas une référence.
// `sourceExerciseId` ne sert qu'à la traçabilité (et à recopier les documents de la
// bibliothèque à l'écriture) : il peut être null, et l'affichage n'en dépend jamais.
export const scheduledSessionExerciseInputSchema = z
  .object({
    sourceExerciseId: z.string().min(1).nullable().optional(),
    title: z.string().min(1).max(EXERCISE_TITLE_MAX_LENGTH),
    description: z.string().max(EXERCISE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    category: exerciseCategorySchema,
    prescription: z.string().max(SESSION_PRESCRIPTION_MAX_LENGTH).nullable().optional(),
  })
  .strict();
export type ScheduledSessionExerciseInput = z.infer<typeof scheduledSessionExerciseInputSchema>;

// Deux façons de poser une séance dans une semaine :
//  - depuis un modèle (`sourceSessionId`) → l'API copie titre, consignes et composition ;
//  - ad hoc → le coach fournit le titre (et éventuellement la composition).
// D'où le refine : sans modèle source, un titre est obligatoire.
export const createScheduledSessionSchema = z
  .object({
    sourceSessionId: z.string().min(1).nullable().optional(),
    scheduledDate: z.iso.date(),
    title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH).optional(),
    notes: z.string().max(SESSION_NOTES_MAX_LENGTH).nullable().optional(),
    exercises: z.array(scheduledSessionExerciseInputSchema).optional(),
  })
  .strict()
  .refine((input) => input.sourceSessionId != null || input.title != null, {
    message: "Titre requis pour une séance sans modèle source",
    path: ["title"],
  });
export type CreateScheduledSessionInput = z.infer<typeof createScheduledSessionSchema>;

// Édition d'une instance (y compris en cours de cycle diffusé — CDC §5.7) : replace-all, comme
// la séance modèle. L'ordre du tableau DÉFINIT les positions. `status` n'est pas éditable en P3.
export const updateScheduledSessionSchema = z
  .object({
    title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH),
    notes: z.string().max(SESSION_NOTES_MAX_LENGTH).nullable().optional(),
    scheduledDate: z.iso.date(),
    exercises: z.array(scheduledSessionExerciseInputSchema),
  })
  .strict();
export type UpdateScheduledSessionInput = z.infer<typeof updateScheduledSessionSchema>;

// ── DTO de sortie ────────────────────────────────────────────────────────────

export const scheduledSessionExerciseDtoSchema = z.object({
  id: z.string(),
  sourceExerciseId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  category: exerciseCategorySchema,
  prescription: z.string().nullable(),
  position: z.number().int(),
  // Copies des documents de l'exercice source (URL signée résolue à chaque lecture).
  documents: z.array(exerciseDocumentDtoSchema),
});
export type ScheduledSessionExerciseDto = z.infer<typeof scheduledSessionExerciseDtoSchema>;

// Résumé : ce qu'affichent la vue semaine et la liste des séances (sans la composition).
export const scheduledSessionSummaryDtoSchema = z.object({
  id: z.string(),
  planId: z.string(),
  planWeekId: z.string(),
  sourceSessionId: z.string().nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  scheduledDate: z.iso.date(),
  position: z.number().int(),
  status: scheduledSessionStatusSchema,
  exerciseCount: z.number().int(),
});
export type ScheduledSessionSummaryDto = z.infer<typeof scheduledSessionSummaryDtoSchema>;

export const scheduledSessionDtoSchema = scheduledSessionSummaryDtoSchema.extend({
  exercises: z.array(scheduledSessionExerciseDtoSchema),
});
export type ScheduledSessionDto = z.infer<typeof scheduledSessionDtoSchema>;

// `startDate`/`endDate` sont CALCULÉS par l'API (planWeekRange) à partir du seul plan.startDate :
// aucune date n'est stockée sur la semaine → pas de dérive possible entre les deux.
export const planWeekDtoSchema = z.object({
  id: z.string(),
  weekNumber: z.number().int(),
  type: planWeekTypeSchema,
  note: z.string().nullable(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  sessions: z.array(scheduledSessionSummaryDtoSchema),
});
export type PlanWeekDto = z.infer<typeof planWeekDtoSchema>;

export const planSummaryDtoSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  athleteId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: z.iso.date(),
  status: planStatusSchema,
  publishedAt: z.iso.datetime().nullable(),
  weekCount: z.number().int(),
  sessionCount: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PlanSummaryDto = z.infer<typeof planSummaryDtoSchema>;

export const planDtoSchema = planSummaryDtoSchema.extend({
  weeks: z.array(planWeekDtoSchema),
});
export type PlanDto = z.infer<typeof planDtoSchema>;
