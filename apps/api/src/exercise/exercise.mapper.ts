import type {
  ExerciseBlocks,
  ExerciseDto,
  FrozenFrom,
  MetricCitations,
  SuggestedMetric,
} from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { ACCESS_INCLUDE, type AccessContext, toAccessView } from "../access/access.mapper";
import {
  type CustomMetricCatalog,
  citedCustomMetrics,
} from "../custom-metric/custom-metric.mapper";
import { toDocumentDto } from "../infra/storage/document.mapper";
import type { StorageService } from "../infra/storage/storage.service";
import { parseBlocks, parseInstructions, parseSuggestedMetrics } from "../util/exercise-json.util";

/** Le Coach d'origine d'une copie figée (#609), que l'exercice, et la ligne qui le cite, nomment. */
export const FROZEN_FROM_INCLUDE = {
  frozenFromCoach: { select: { id: true, name: true } },
} satisfies Prisma.ExerciseInclude;

/** `null` pour un exercice qui n'est pas une copie figée : `frozenAt` seul le dit. */
export function toFrozenFrom(
  exercise: Pick<
    Prisma.ExerciseGetPayload<{ include: typeof FROZEN_FROM_INCLUDE }>,
    "frozenAt" | "frozenFromCoach"
  >,
): FrozenFrom | null {
  if (exercise.frozenAt == null) return null;
  return { coach: exercise.frozenFromCoach, at: exercise.frozenAt.toISOString() };
}

/**
 * Les séances qui citent l'exercice, et ses droits : ce que la suppression et la réduction d'accès
 * jugent (#609). Imbriquées, les lignes se lisent chez TOUS les Coachs (piège n°8) : la séance de M
 * qui cite l'exercice de C est touchée par sa modification autant que celle de C. Une ligne par
 * SÉANCE (`distinct`) — une séance qui cite deux fois l'exercice ne compte qu'une fois, et une
 * séance est à un seul Coach — avec son seul propriétaire : seuls des décomptes et des ids de Coach
 * en sortent.
 */
export const EXERCISE_CITATIONS_INCLUDE = {
  sessionExercises: { select: { coachId: true, sessionId: true }, distinct: ["sessionId"] },
  ...ACCESS_INCLUDE,
} satisfies Prisma.ExerciseInclude;

export type ExerciseWithCitations = Prisma.ExerciseGetPayload<{
  include: typeof EXERCISE_CITATIONS_INCLUDE;
}>;

/**
 * Tout ce qu'un `ExerciseDto` demande, en une requête. Un point unique parce que les quatre
 * lectures du service doivent charger EXACTEMENT la même chose : un `include` oublié quelque part
 * ne casse pas la compilation, il rend un DTO amputé à l'exécution.
 */
export const EXERCISE_DETAIL_INCLUDE = {
  documents: true,
  tags: true,
  ...FROZEN_FROM_INCLUDE,
  ...EXERCISE_CITATIONS_INCLUDE,
} satisfies Prisma.ExerciseInclude;

/**
 * Un exercice de la bibliothèque tel qu'une séance ou une planification le reprend : ses documents
 * (recopiés sous la même clé objet) et ses tags.
 */
export const LIBRARY_EXERCISE_INCLUDE = {
  // Dans l'ordre où la séance planifiée les recopie.
  documents: { orderBy: { createdAt: "asc" } },
  tags: true,
} satisfies Prisma.ExerciseInclude;

export type LibraryExercise = Prisma.ExerciseGetPayload<{
  include: typeof LIBRARY_EXERCISE_INCLUDE;
}>;

// L'exercice avec ses documents (URLs signées à résoudre), ses tags et son décompte d'usage.
export type ExerciseWithDocuments = Prisma.ExerciseGetPayload<{
  include: typeof EXERCISE_DETAIL_INCLUDE;
}>;

/**
 * Ce qu'un exercice cite du catalogue de son propriétaire : ses blocs, et ses métriques suggérées
 * (#718). L'écriture le vérifie, le DTO le résout, la copie l'adopte : une seule règle pour les trois.
 */
export function metricCitationsOf(
  blocks: ExerciseBlocks,
  suggested: readonly SuggestedMetric[],
): MetricCitations {
  return [...blocks, { metrics: suggested }];
}

/**
 * `catalog` : celui du PROPRIÉTAIRE de l'exercice, que ses blocs citent (piège n°9). `context` :
 * l'acteur et ses entreprises, de quoi dire son droit sur l'exercice.
 */
export async function toExerciseDto(
  exercise: ExerciseWithDocuments,
  storage: StorageService,
  catalog: CustomMetricCatalog,
  context: AccessContext,
): Promise<ExerciseDto> {
  const blocks = parseBlocks(exercise.blocks);
  const suggestedMetrics = parseSuggestedMetrics(exercise.suggestedMetrics);
  const citations = citationsOf(exercise);
  // Documents ordonnés par ancienneté ; chaque FILE reçoit une URL GET signée.
  const documents = await Promise.all(
    exercise.documents
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((doc) => toDocumentDto(doc, storage)),
  );
  return {
    id: exercise.id,
    coachId: exercise.coachId,
    ...toAccessView(exercise, context),
    title: exercise.title,
    description: exercise.description,
    instructions: parseInstructions(exercise.instructions),
    blocks,
    suggestedMetrics,
    customMetrics: citedCustomMetrics(metricCitationsOf(blocks, suggestedMetrics), catalog),
    // Triés : l'ordre d'insertion n'a aucun sens pour un tag, et une liste stable évite un
    // faux diff à chaque relecture côté client.
    tags: exercise.tags.map((tag) => tag.name).sort(),
    usedInSessionCount: citations.sessionCount,
    foreignSessionCount:
      context.actorId === exercise.coachId ? citations.foreignSessionCount : null,
    frozenFrom: toFrozenFrom(exercise),
    documents,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}

/**
 * Les séances qui citent l'exercice, partagées entre son propriétaire et les AUTRES Coachs (#609) :
 * celles du premier refusent la suppression, les autres en gardent une copie figée. Une seule
 * règle pour le préavis (`foreignSessionCount`) et pour les copies écrites.
 */
export function citationsOf(exercise: Pick<ExerciseWithCitations, "coachId" | "sessionExercises">) {
  const foreign = exercise.sessionExercises.filter((row) => row.coachId !== exercise.coachId);
  return {
    sessionCount: exercise.sessionExercises.length,
    ownSessionCount: exercise.sessionExercises.length - foreign.length,
    foreignSessionCount: foreign.length,
    foreignCoachIds: [...new Set(foreign.map((row) => row.coachId))],
  };
}
