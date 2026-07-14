import type { ScheduledSessionDto, ScheduledSessionExerciseDto } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toDocumentDto } from "../infra/storage/document.mapper";
import type { StorageService } from "../infra/storage/storage.service";
import { toIsoDate } from "../util/date.util";

// La séance planifiée avec sa composition (copies) et les documents copiés de la bibliothèque.
export const SESSION_DETAIL_INCLUDE = {
  exercises: { orderBy: { position: "asc" }, include: { documents: true } },
} satisfies Prisma.ScheduledSessionInclude;

export type ScheduledSessionWithExercises = Prisma.ScheduledSessionGetPayload<{
  include: { exercises: { include: { documents: true } } };
}>;

type ScheduledExerciseWithDocuments = ScheduledSessionWithExercises["exercises"][number];

async function toExerciseDto(
  exercise: ScheduledExerciseWithDocuments,
  storage: StorageService,
): Promise<ScheduledSessionExerciseDto> {
  const documents = await Promise.all(
    exercise.documents
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((doc) => toDocumentDto(doc, storage)),
  );
  return {
    id: exercise.id,
    sourceExerciseId: exercise.sourceExerciseId,
    title: exercise.title,
    description: exercise.description,
    category: exercise.category,
    prescription: exercise.prescription,
    position: exercise.position,
    documents,
  };
}

export async function toScheduledSessionDto(
  session: ScheduledSessionWithExercises,
  storage: StorageService,
): Promise<ScheduledSessionDto> {
  const exercises = await Promise.all(
    session.exercises.map((exercise) => toExerciseDto(exercise, storage)),
  );
  return {
    id: session.id,
    planId: session.planId,
    planWeekId: session.planWeekId,
    sourceSessionId: session.sourceSessionId,
    title: session.title,
    notes: session.notes,
    scheduledDate: toIsoDate(session.scheduledDate),
    position: session.position,
    status: session.status,
    exerciseCount: session.exercises.length,
    exercises,
  };
}
