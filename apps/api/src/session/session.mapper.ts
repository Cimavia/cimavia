import type { SessionDto } from "@cmv/shared";
import type { Prisma } from "@prisma/client";

// L'exercice référencé, avec ses tags : le DTO les expose, et un `include` les charge en une
// requête plutôt qu'une par ligne de composition.
export type ExerciseWithTags = Prisma.ExerciseGetPayload<{ include: { tags: true } }>;

// La séance avec ses exercices composés (positions), ordonnés.
export type SessionWithExercises = Prisma.SessionGetPayload<{ include: { exercises: true } }>;

/**
 * Assemble le DTO à partir de la séance et de la map d'exercices — celle-ci est chargée par une
 * requête SCOPÉE séparée (les include imbriqués ne sont pas scopés, cf. architecture-choice §6).
 * Un exercice absent de la map est une fuite de scope : on lève plutôt que d'afficher un trou.
 */
export function toSessionDto(
  session: SessionWithExercises,
  exerciseById: Map<string, ExerciseWithTags>,
): SessionDto {
  return {
    id: session.id,
    coachId: session.coachId,
    title: session.title,
    notes: session.notes,
    exercises: session.exercises.map((composed) => {
      const exercise = exerciseById.get(composed.exerciseId);
      if (exercise == null) {
        throw new Error(
          `[session] exercice ${composed.exerciseId} hors scope pour la séance ${session.id}`,
        );
      }
      return {
        id: composed.id,
        exerciseId: composed.exerciseId,
        position: composed.position,
        prescription: composed.prescription,
        title: exercise.title,
        // Triés, comme partout ailleurs : l'ordre d'insertion n'a aucun sens pour un tag.
        tags: exercise.tags.map((tag) => tag.name).sort(),
      };
    }),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
