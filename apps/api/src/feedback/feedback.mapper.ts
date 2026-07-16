import type { FeedbackMediaDto, SessionFeedbackDto } from "@cmv/shared";
import type { FeedbackMedia, Prisma } from "@prisma/client";
import type { StorageService } from "../infra/storage/storage.service";

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

export async function toSessionFeedbackDto(
  feedback: SessionFeedbackWithMedia,
  storage: StorageService,
): Promise<SessionFeedbackDto> {
  const media = await Promise.all(feedback.media.map((item) => toFeedbackMediaDto(item, storage)));
  return {
    id: feedback.id,
    scheduledSessionId: feedback.scheduledSessionId,
    athleteId: feedback.athleteId,
    content: feedback.content,
    coachReadAt: feedback.coachReadAt?.toISOString() ?? null,
    media,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };
}
