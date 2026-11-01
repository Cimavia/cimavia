import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import { isMondayIsoDate } from "../util/date.util";
import { accessGrantDtoSchema, coachGrantDtoSchema, myAccessSchema } from "./access.schema";
import { exerciseDocumentDtoSchema } from "./exercise.schema";
import { customMetricSchema } from "./exercise-metric.schema";
import { expectedVersionSchema } from "./expected-version.schema";
import { richDocumentSchema } from "./rich-document.schema";
import { SESSION_NOTES_MAX_LENGTH, SESSION_TITLE_MAX_LENGTH } from "./session.schema";
import { scheduledSessionBlockDtoSchema } from "./session-block-dto.schema";

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
    /**
     * Facultatif (#144) : un cycle se construit avant de savoir pour qui. Le coach qui prépare un
     * bloc « force max, 6 semaines » n'a pas à désigner un athlète au hasard pour commencer.
     * Obligatoire à la DIFFUSION en revanche — le verrou s'est déplacé, il n'a pas disparu.
     */
    athleteId: z.string().min(1).nullable().optional(),
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
    /**
     * Affecter, réaffecter ou détacher le destinataire d'un BROUILLON (#144). Absent = ne rien
     * changer ; `null` = détacher — les deux se distinguent, et c'est pour ça que le champ est à
     * la fois `nullable` et `optional`.
     *
     * Refusé sur un cycle diffusé (409) : son destinataire en a déjà été prévenu.
     */
    athleteId: z.string().min(1).nullable().optional(),
    expectedUpdatedAt: expectedVersionSchema,
  })
  .strict();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

/**
 * Les gestes sur une semaine citent la version de la semaine AFFICHÉE (#604) : type, collage,
 * ordre d'une journée, retrait. Toute écriture de ses séances la fait avancer — un geste fondé sur
 * une grille qu'un autre Coach a changée depuis est refusé en 409 `STALE_WRITE`, plutôt que de
 * défaire son travail sans un mot.
 */
export const updatePlanWeekSchema = z
  .object({
    type: planWeekTypeSchema.optional(),
    note: z.string().max(PLAN_WEEK_NOTE_MAX_LENGTH).nullable().optional(),
    expectedUpdatedAt: expectedVersionSchema,
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
    // La version de la CIBLE, celle dont le contenu est remplacé.
    expectedUpdatedAt: expectedVersionSchema,
  })
  .strict();
export type CopyPlanWeekInput = z.infer<typeof copyPlanWeekSchema>;

/**
 * Poser une séance dans une semaine, depuis une séance-type (`sourceSessionId`) : l'API en copie
 * titre, notes et blocs (#723). Il n'y a plus de séance ad hoc composée exercice par exercice —
 * une séance se compose par blocs, et ses blocs viennent d'un modèle ; on l'ajuste ensuite.
 */
export const createScheduledSessionSchema = z
  .object({
    sourceSessionId: z.string().min(1),
    scheduledDate: z.iso.date(),
  })
  .strict();
export type CreateScheduledSessionInput = z.infer<typeof createScheduledSessionSchema>;

/**
 * Édition d'une instance (y compris en cours de cycle diffusé — CDC §5.7) : titre, notes et jour.
 * La composition s'écrit geste par geste (`scheduledCompositionInputSchema`, #720).
 *
 * Elle cite la version de la séance OUVERTE (#604) : deux Coachs d'une entreprise peuvent ajuster
 * la même séance, et le second effacerait sinon le premier sans un mot. Le débrief de l'athlète ne
 * la fait pas avancer — il ne touche à rien de ce que le Coach a composé.
 */
export const updateScheduledSessionSchema = z
  .object({
    title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH),
    notes: z.string().max(SESSION_NOTES_MAX_LENGTH).nullable().optional(),
    scheduledDate: z.iso.date(),
    expectedUpdatedAt: expectedVersionSchema,
  })
  .strict();
export type UpdateScheduledSessionInput = z.infer<typeof updateScheduledSessionSchema>;

/**
 * Le CONTENU d'une journée et son ordre (#148, élargi en #93) — replace-all, comme toute
 * composition du produit : le tableau DÉFINIT ce que la journée porte, il ne le décrit pas.
 *
 * Il peut citer une séance posée un AUTRE jour de la même semaine : elle y est déplacée, au rang
 * exact où le tableau la place. En revanche il ne peut OMETTRE aucune séance déjà posée ce
 * jour-là — l'omettre ne dirait pas où elle va, et le service refuse : elle garderait son rang
 * d'avant, donc des trous et des collisions sur
 * `@@unique([planWeekId, scheduledDate, position])`.
 *
 * `min(1)` plutôt que `min(2)` : réordonner une journée d'une seule séance est un no-op légitime
 * (un client qui renvoie ce qu'il affiche), là où une journée vide n'a rien à réordonner.
 */
export const reorderPlanDaySchema = z
  .object({
    sessionIds: z.array(z.string().min(1)).min(1),
    expectedUpdatedAt: expectedVersionSchema,
  })
  .strict();
export type ReorderPlanDayInput = z.infer<typeof reorderPlanDaySchema>;

/**
 * Retirer un cycle, une semaine ou une séance planifiée : sans corps, la version voyage en
 * paramètre de requête (#604).
 */
export const versionQuerySchema = z.object({ expectedUpdatedAt: expectedVersionSchema }).strict();
export type VersionQuery = z.infer<typeof versionQuerySchema>;

/**
 * Diffuser un cycle cite la version AFFICHÉE (#604) : le destinataire, le titre ou le début ont pu
 * changer sous la main d'un autre Coach depuis, et la diffusion partirait alors chez un athlète que
 * celui qui diffuse n'a jamais vu à l'écran — notifié, et facturé. La même forme que le retrait,
 * en corps plutôt qu'en requête.
 */
export const publishPlanSchema = versionQuerySchema;
export type PublishPlanInput = z.infer<typeof publishPlanSchema>;

// ── DTO de sortie ────────────────────────────────────────────────────────────

export const scheduledSessionExerciseDtoSchema = z.object({
  id: z.string(),
  sourceExerciseId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  // Copie FIGÉE elle aussi : l'athlète lit la consigne telle qu'elle était à la diffusion, même
  // si le coach a retravaillé l'exercice de sa bibliothèque depuis.
  instructions: richDocumentSchema.nullable(),
  /**
   * Les métriques MAISON que cite la grille de l'exercice, copiées à la diffusion. Sans elles
   * l'athlète ne verrait qu'un identifiant : `/custom-metrics` est scopé au coach, et faire
   * dépendre la lecture d'une planif de la bibliothèque du coach casserait l'autonomie du snapshot
   * (décision P3).
   */
  customMetrics: z.array(customMetricSchema),
  // Copie FIGÉE des tags de l'exercice source, comme les documents : l'affichage d'une planif
  // diffusée ne dépend jamais de la bibliothèque, qui peut avoir été retaguée depuis.
  tags: z.array(z.string()),
  note: z.string().nullable(),
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
  blockCount: z.number().int(),
  /**
   * La dernière écriture sur la séance (#307). Le mobile s'en sert pour savoir si le déroulé qu'il
   * garde hors-ligne est encore le bon : retoucher une séance ne touche pas la ligne `Plan`, et
   * `PlanDto.updatedAt` seul laissait l'athlète s'entraîner sur la version d'avant.
   */
  updatedAt: z.iso.datetime(),
});
export type ScheduledSessionSummaryDto = z.infer<typeof scheduledSessionSummaryDtoSchema>;

export const scheduledSessionDtoSchema = scheduledSessionSummaryDtoSchema.extend({
  /**
   * Le coach dont vient la séance (#599). Un athlète suivi par plusieurs coachs ne saurait pas,
   * sans lui, à qui écrire depuis la séance ni avec qui son débrief s'échange : c'est le fil de CE
   * coach qui s'ouvre. Sur le détail seulement — dans le planning, chaque cycle le porte déjà.
   */
  coachId: z.string(),
  coachName: z.string(),
  exercises: z.array(scheduledSessionExerciseDtoSchema),
  /**
   * La composition par blocs (#716), lue IMBRIQUÉE dans la séance : un exercice de bloc n'a de
   * sens que dans son bloc.
   */
  blocks: z.array(scheduledSessionBlockDtoSchema),
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
  // La version que citent les gestes sur la semaine (#604).
  updatedAt: z.iso.datetime(),
  sessions: z.array(scheduledSessionSummaryDtoSchema),
});
export type PlanWeekDto = z.infer<typeof planWeekDtoSchema>;

export const planSummaryDtoSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  /**
   * Le coach qui a écrit le cycle (#599) : un athlète suivi par plusieurs coachs doit savoir de qui
   * vient chacun. Toujours renseigné — un cycle a toujours un auteur.
   */
  coachName: z.string(),
  /**
   * Ce que le Coach courant peut faire du cycle, et l'entreprise qui le lui ouvre (#607) : un cycle
   * partagé se lit, ou s'écrit, sans être à soi. `null` pour l'athlète, qui le suit sans droit
   * d'accès — il en est le destinataire.
   */
  myAccess: myAccessSchema.nullable(),
  /**
   * `null` = brouillon dont le destinataire n'est pas encore choisi (#144). Ce n'est pas une
   * donnée manquante mais un ÉTAT, et il est actionnable : le coach affecte quand il a décidé.
   * Toujours renseigné sur un cycle diffusé — `publish` l'exige.
   */
  athleteId: z.string().nullable(),
  /**
   * Le nom et l'adresse de l'athlète destinataire. Sans eux, un coach devant sa liste de cycles ne
   * sait pas à qui chacun s'adresse — l'identifiant ne se lit pas. `null` avec `athleteId` : les
   * trois champs décrivent la même absence, il n'y a pas de cycle nommé sans destinataire.
   */
  athleteName: z.string().nullable(),
  athleteEmail: z.string().nullable(),
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
  /** Les droits accordés, pour le panneau du propriétaire ; `null` pour tout autre lecteur. */
  grants: z.array(accessGrantDtoSchema).nullable(),
  /** Ceux des Coachs (#608), pour le même panneau ; `null` pour tout autre lecteur. */
  coachGrants: z.array(coachGrantDtoSchema).nullable(),
  weeks: z.array(planWeekDtoSchema),
});
export type PlanDto = z.infer<typeof planDtoSchema>;
