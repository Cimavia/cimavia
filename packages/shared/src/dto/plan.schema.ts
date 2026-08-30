import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import { isMondayIsoDate } from "../util/date.util";
import { adjustmentsSchema } from "./dosage-override.schema";
import {
  EXERCISE_DESCRIPTION_MAX_LENGTH,
  EXERCISE_TITLE_MAX_LENGTH,
  exerciseDocumentDtoSchema,
  exerciseTagsSchema,
} from "./exercise.schema";
import { exerciseBlocksSchema, exerciseTrackingSchema } from "./exercise-block.schema";
import { customMetricSchema } from "./exercise-metric.schema";
import { richDocumentSchema } from "./rich-document.schema";
import {
  SESSION_NOTE_MAX_LENGTH,
  SESSION_NOTES_MAX_LENGTH,
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

/**
 * Copier une semaine dans une autre (#4). Seule la SOURCE voyage dans le corps : la semaine
 * cible est la ressource de la route, et c'est elle qui est écrite.
 *
 * Aucune date n'est transmise — la copie n'emporte que ce qui est planifié, et les
 * `scheduledDate` se recalculent depuis le lundi de la semaine cible (`planWeekCopyShiftDays`).
 * Laisser le client proposer des dates rouvrirait la porte à une séance posée hors de la plage
 * de sa semaine, invariant que l'API tient seule.
 */
export const copyPlanWeekSchema = z
  .object({
    sourcePlanWeekId: z.string().min(1),
  })
  .strict();
export type CopyPlanWeekInput = z.infer<typeof copyPlanWeekSchema>;

// Exercice d'une séance planifiée : une COPIE (titre/description/catégorie), pas une référence.
// `sourceExerciseId` ne sert qu'à la traçabilité (et à recopier les documents de la
// bibliothèque à l'écriture) : il peut être null, et l'affichage n'en dépend jamais.
export const scheduledSessionExerciseInputSchema = z
  .object({
    /**
     * L'exercice diffusé qu'on renvoie, quand il existe déjà.
     *
     * L'édition d'une séance planifiée est un REPLACE-ALL : tout est supprimé puis réécrit. Sans
     * cette trace, le serveur ne peut rattacher aucune ligne à sa précédente, et ce qui ne
     * transite pas par le client — le SUIVI de l'athlète — disparaît à chaque enregistrement du
     * coach. Absent = exercice nouveau.
     */
    id: z.string().min(1).optional(),
    sourceExerciseId: z.string().min(1).nullable().optional(),
    title: z.string().min(1).max(EXERCISE_TITLE_MAX_LENGTH),
    description: z.string().max(EXERCISE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    // Copiés de l'exercice source au moment de la diffusion, comme les documents et les tags.
    instructions: richDocumentSchema.nullable().optional(),
    blocks: exerciseBlocksSchema.optional(),
    customMetrics: z.array(customMetricSchema).optional(),
    tags: exerciseTagsSchema.optional(),
    note: z.string().max(SESSION_NOTE_MAX_LENGTH).nullable().optional(),
    adjustments: adjustmentsSchema.optional(),
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
  // Copies FIGÉES elles aussi : l'athlète lit la consigne et la structure telles qu'elles étaient
  // à la diffusion, même si le coach a retravaillé l'exercice de sa bibliothèque depuis.
  instructions: richDocumentSchema.nullable(),
  blocks: exerciseBlocksSchema,
  /**
   * Les métriques MAISON citées par les blocs, copiées à la diffusion. Sans elles l'athlète ne
   * verrait qu'un identifiant : `/custom-metrics` est scopé au coach, et faire dépendre la lecture
   * d'une planif de la bibliothèque du coach casserait l'autonomie du snapshot (décision P3).
   */
  customMetrics: z.array(customMetricSchema),
  /**
   * Le suivi d'exécution. `null` = NON SUIVI, ce qui n'est pas « zéro coché » : l'athlète n'a
   * rien dit, et l'affichage doit rester silencieux — jamais « 0 sur 4 », jamais de relance.
   */
  tracking: exerciseTrackingSchema.nullable(),
  // Copie FIGÉE des tags de l'exercice source, comme les documents : l'affichage d'une planif
  // diffusée ne dépend jamais de la bibliothèque, qui peut avoir été retaguée depuis.
  tags: z.array(z.string()),
  note: z.string().nullable(),
  /** Ce dont le troisième niveau part : ce que la séance a diffusé. */
  baseline: exerciseBlocksSchema,
  adjustments: adjustmentsSchema,
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
  /**
   * Le nom et l'adresse de l'athlète destinataire. Sans eux, un coach devant sa liste de cycles ne
   * sait pas à qui chacun s'adresse — l'identifiant ne se lit pas.
   */
  athleteName: z.string(),
  athleteEmail: z.string(),
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
