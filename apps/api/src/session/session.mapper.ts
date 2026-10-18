import type { SessionDto } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { ACCESS_INCLUDE, type AccessContext, toAccessView } from "../access/access.mapper";
import { type CatalogOf, citedCustomMetrics } from "../custom-metric/custom-metric.mapper";
import { FROZEN_FROM_INCLUDE, toFrozenFrom } from "../exercise/exercise.mapper";
import { parseAdjustments, parseBlocks } from "../util/exercise-json.util";

/**
 * La séance avec sa composition ordonnée, et l'exercice que chaque ligne cite.
 *
 * L'exercice arrive par un `include` imbriqué, que la couche d'isolation ne scope pas (piège n°2) —
 * et c'est voulu : il se lit À TRAVERS la séance, déjà prouvée lisible (#605). Tout exercice cité a
 * été prouvé accessible à l'écriture de la ligne (`loadAccessibleOrThrow`), et un exercice privé de
 * C, cité par la séance qu'il ouvre à F, doit s'y afficher pour M sans entrer dans sa bibliothèque.
 */
export const SESSION_DETAIL_INCLUDE = {
  exercises: {
    orderBy: { position: "asc" },
    include: { exercise: { include: { tags: true, ...FROZEN_FROM_INCLUDE } } },
  },
  ...ACCESS_INCLUDE,
} satisfies Prisma.SessionInclude;

export type SessionWithExercises = Prisma.SessionGetPayload<{
  include: typeof SESSION_DETAIL_INCLUDE;
}>;

/** Les propriétaires des exercices composés : leurs catalogues, que les blocs citent. */
export function exerciseOwnersOf(sessions: readonly SessionWithExercises[]): string[] {
  return sessions.flatMap((session) => session.exercises.map((row) => row.exercise.coachId));
}

export function toSessionDto(
  session: SessionWithExercises,
  catalogOf: CatalogOf,
  context: AccessContext,
): SessionDto {
  return {
    id: session.id,
    coachId: session.coachId,
    ...toAccessView(session, context),
    title: session.title,
    notes: session.notes,
    exercises: session.exercises.map((composed) => {
      const blocks = parseBlocks(composed.blocks);
      return {
        id: composed.id,
        exerciseId: composed.exerciseId,
        position: composed.position,
        note: composed.note,
        blocks,
        baseline: parseBlocks(composed.baseline),
        adjustments: parseAdjustments(composed.adjustments),
        title: composed.exercise.title,
        // Le verrou de forme garde les colonnes de l'exercice : celles de la ligne citent donc le
        // catalogue de SON propriétaire.
        customMetrics: citedCustomMetrics(blocks, catalogOf(composed.exercise.coachId)),
        // Triés, comme partout ailleurs : l'ordre d'insertion n'a aucun sens pour un tag.
        tags: composed.exercise.tags.map((tag) => tag.name).sort(),
        frozenFrom: toFrozenFrom(composed.exercise),
      };
    }),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
