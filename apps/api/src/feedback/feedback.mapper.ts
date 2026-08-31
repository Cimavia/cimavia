import type { FeedbackMediaDto, SessionFeedbackDto, TrackedExerciseDto } from "@cmv/shared";
import { trackingSummary } from "@cmv/shared";
import type { FeedbackMedia, Prisma, ScheduledSessionExercise } from "@prisma/client";
import type { StorageService } from "../infra/storage/storage.service";
import { parseBlocks, parseTracking } from "../util/exercise-json.util";

// Le débrief avec ses médias, du plus ancien au plus récent (ordre d'ajout par l'athlète).
export const FEEDBACK_DETAIL_INCLUDE = {
  media: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.SessionFeedbackInclude;

export type SessionFeedbackWithMedia = Prisma.SessionFeedbackGetPayload<{
  include: { media: true };
}>;

// Un média de débrief est toujours un fichier privé : contrairement au document de la
// bibliothèque (FILE ou LINK), il n'y a pas de cas « lien externe » — donc pas d'union à
// discriminer, l'URL est toujours signée.
export async function toFeedbackMediaDto(
  media: FeedbackMedia,
  storage: StorageService,
): Promise<FeedbackMediaDto> {
  return {
    id: media.id,
    type: media.type,
    url: await storage.createDownloadUrl(media.storagePath),
    fileName: media.fileName,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    durationSeconds: media.durationSeconds,
    createdAt: media.createdAt.toISOString(),
  };
}

/**
 * Le décompte résumé, exercice par exercice.
 *
 * Calculé ICI plutôt que chez le client : le coach lit un débrief sans charger la séance de son
 * athlète, et lui faire dérouler les blocs pour compter des cases ajouterait un appel sur deux
 * surfaces pour la même réponse.
 */
export function toTrackedExercises(
  exercises: readonly Pick<ScheduledSessionExercise, "id" | "title" | "blocks" | "tracking">[],
): TrackedExerciseDto[] {
  return exercises.map((exercise) => {
    const summary = trackingSummary(parseBlocks(exercise.blocks), parseTracking(exercise.tracking));
    return {
      exerciseId: exercise.id,
      title: exercise.title,
      state: summary.state,
      done: summary.done,
      total: summary.total,
      unit: summary.unit,
    };
  });
}

export async function toSessionFeedbackDto(
  feedback: SessionFeedbackWithMedia,
  storage: StorageService,
  trackedExercises: TrackedExerciseDto[] = [],
): Promise<SessionFeedbackDto> {
  const media = await Promise.all(feedback.media.map((item) => toFeedbackMediaDto(item, storage)));
  return {
    id: feedback.id,
    scheduledSessionId: feedback.scheduledSessionId,
    athleteId: feedback.athleteId,
    content: feedback.content,
    coachReadAt: feedback.coachReadAt?.toISOString() ?? null,
    media,
    trackedExercises,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };
}
