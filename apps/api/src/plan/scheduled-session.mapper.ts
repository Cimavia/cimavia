import {
  isRemovedBlock,
  type ScheduledSessionDto,
  type ScheduledSessionExerciseDto,
} from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toDocumentDto } from "../infra/storage/document.mapper";
import type { StorageService } from "../infra/storage/storage.service";
import {
  SCHEDULED_SESSION_BLOCKS_INCLUDE,
  toScheduledSessionBlockDto,
} from "../session/session-block.mapper";
import { toIsoDate } from "../util/date.util";
import { parseCustomMetrics, parseInstructions } from "../util/exercise-json.util";

// La séance planifiée avec sa composition (copies) et les documents copiés de la bibliothèque.
// Le coach, par le cycle : la séance n'a que la colonne `coachId`, pas la relation (#599). Ses
// blocs (#716) arrivent imbriqués, comme ses exercices : l'athlète ne les lit qu'à travers elle.
export const SESSION_DETAIL_INCLUDE = {
  exercises: { orderBy: { position: "asc" }, include: { documents: true, tags: true } },
  blocks: SCHEDULED_SESSION_BLOCKS_INCLUDE,
  plan: { select: { coach: { select: { name: true } } } },
} satisfies Prisma.ScheduledSessionInclude;

export type ScheduledSessionWithExercises = Prisma.ScheduledSessionGetPayload<{
  include: typeof SESSION_DETAIL_INCLUDE;
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
    instructions: parseInstructions(exercise.instructions),
    tags: exercise.tags.map((tag) => tag.name).sort(),
    note: exercise.note,
    customMetrics: parseCustomMetrics(exercise.customMetrics),
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
  // Un bloc retiré (#744) ne se lit pas : la séance est ce que l'athlète a à faire — y compris
  // pour une build mobile déjà installée, qui ne sait rien d'un bloc vide. Le panneau du coach lit
  // les copies, qui le gardent à son rang.
  const blocks = session.blocks.filter((block) => !isRemovedBlock(block));
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
    blockCount: blocks.length,
    updatedAt: session.updatedAt.toISOString(),
    coachId: session.coachId,
    coachName: session.plan.coach.name,
    exercises,
    blocks: blocks.map(toScheduledSessionBlockDto),
  };
}
