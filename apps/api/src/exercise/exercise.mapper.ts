import { type ExerciseDto, exerciseBlocksSchema, richDocumentSchema } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toDocumentDto } from "../infra/storage/document.mapper";
import type { StorageService } from "../infra/storage/storage.service";

// L'exercice avec ses documents (URLs signées à résoudre).
export type ExerciseWithDocuments = Prisma.ExerciseGetPayload<{
  include: { documents: true; tags: true };
}>;

/**
 * Les colonnes JSON reviennent de Prisma en `JsonValue` : typées `any`-ish, sans contrat. On les
 * repasse par le schéma Zod à la LECTURE, et on laisse l'échec remonter.
 *
 * Un `safeParse` avec repli sur `null` serait plus doux, et c'est précisément le problème : la
 * consigne d'un coach disparaîtrait de l'écran sans que personne l'apprenne. La donnée n'entre que
 * par l'API validée ou par la migration de reprise — un document illisible est donc un BUG, et un
 * 500 est la réponse honnête.
 */
export function parseInstructions(value: Prisma.JsonValue): ExerciseDto["instructions"] {
  return value === null ? null : richDocumentSchema.parse(value);
}

export function parseBlocks(value: Prisma.JsonValue): ExerciseDto["blocks"] {
  return exerciseBlocksSchema.parse(value);
}

export async function toExerciseDto(
  exercise: ExerciseWithDocuments,
  storage: StorageService,
): Promise<ExerciseDto> {
  // Documents ordonnés par ancienneté ; chaque FILE reçoit une URL GET signée.
  const documents = await Promise.all(
    exercise.documents
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((doc) => toDocumentDto(doc, storage)),
  );
  return {
    id: exercise.id,
    coachId: exercise.coachId,
    title: exercise.title,
    description: exercise.description,
    instructions: parseInstructions(exercise.instructions),
    blocks: parseBlocks(exercise.blocks),
    category: exercise.category,
    // Triés : l'ordre d'insertion n'a aucun sens pour un tag, et une liste stable évite un
    // faux diff à chaque relecture côté client.
    tags: exercise.tags.map((tag) => tag.name).sort(),
    documents,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}
