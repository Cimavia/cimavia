import type { ExerciseDto } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { ACCESS_INCLUDE, type AccessContext, toAccessView } from "../access/access.mapper";
import {
  type CustomMetricCatalog,
  citedCustomMetrics,
} from "../custom-metric/custom-metric.mapper";
import { toDocumentDto } from "../infra/storage/document.mapper";
import type { StorageService } from "../infra/storage/storage.service";
import { parseBlocks, parseInstructions } from "../util/exercise-json.util";

/**
 * Tout ce qu'un `ExerciseDto` demande, en une requête. Un point unique parce que les quatre
 * lectures du service doivent charger EXACTEMENT la même chose : un `include` oublié quelque part
 * ne casse pas la compilation, il rend un DTO amputé à l'exécution.
 */
export const EXERCISE_DETAIL_INCLUDE = {
  documents: true,
  tags: true,
  // Imbriqué, donc compté chez TOUS les Coachs (piège n°8) : la séance de M qui cite l'exercice de
  // C est touchée par sa modification autant que celle de C.
  _count: { select: { sessionExercises: true } },
  ...ACCESS_INCLUDE,
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
    customMetrics: citedCustomMetrics(blocks, catalog),
    // Triés : l'ordre d'insertion n'a aucun sens pour un tag, et une liste stable évite un
    // faux diff à chaque relecture côté client.
    tags: exercise.tags.map((tag) => tag.name).sort(),
    usedInSessionCount: exercise._count.sessionExercises,
    documents,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}
