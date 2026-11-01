import type {
  FeedbackMediaDto,
  MessageDto,
  SessionFeedbackDto,
  TrackedBlockDto,
} from "@cmv/shared";
import type {
  FeedbackMedia,
  Prisma,
  ScheduledSessionBlock,
  ScheduledSessionExercise,
} from "@prisma/client";
import type { StorageService } from "../infra/storage/storage.service";
import { parseBlockTracking, parseSettings } from "../util/block-json.util";

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
 * Les clés des exercices d'un bloc, dans l'ordre du bloc : une coche désigne sa case par elles. La
 * même lecture sert à valider le suivi reçu et à le rendre, sinon une case acceptée se lirait
 * contre une autre.
 */
export const BLOCK_EXERCISE_KEYS = {
  select: { key: true },
  orderBy: { blockPosition: "asc" },
} as const satisfies Prisma.ScheduledSessionExerciseFindManyArgs;

export function blockExerciseKeys(
  rows: readonly Pick<ScheduledSessionExercise, "key">[],
): string[] {
  return rows.map((row) => row.key);
}

/**
 * Le suivi par bloc (#722), bloc par bloc : la matière de ses cases et de son décompte, que chaque
 * app rend dans sa langue (`blockChecks`, `blockTally`). Calculé ICI plutôt que chez le client : le
 * coach lit un débrief sans charger la séance de son athlète.
 */
export function toTrackedBlocks(
  blocks: readonly (Pick<
    ScheduledSessionBlock,
    "id" | "label" | "name" | "settings" | "tracking"
  > & {
    exercises: readonly Pick<ScheduledSessionExercise, "key">[];
  })[],
): TrackedBlockDto[] {
  return blocks.map((block) => ({
    blockId: block.id,
    label: block.label,
    name: block.name,
    settings: parseSettings(block.settings),
    exerciseKeys: blockExerciseKeys(block.exercises),
    tracking: parseBlockTracking(block.tracking),
  }));
}

/**
 * Le débrief tel qu'il se lit — par son auteur comme par son coach, c'est le même DTO.
 *
 * `messages` sont les réponses rattachées : les MÊMES enregistrements que la messagerie sert, lus
 * par un second chemin. Ils arrivent déjà mappés (le mapper des messages a besoin du storage et du
 * résolveur de rattachement, qui ne sont pas l'affaire de ce fichier).
 */
export async function toSessionFeedbackDto(
  feedback: SessionFeedbackWithMedia,
  storage: StorageService,
  trackedBlocks: TrackedBlockDto[] = [],
  messages: MessageDto[] = [],
): Promise<SessionFeedbackDto> {
  const media = await Promise.all(feedback.media.map((item) => toFeedbackMediaDto(item, storage)));
  return {
    id: feedback.id,
    scheduledSessionId: feedback.scheduledSessionId,
    athleteId: feedback.athleteId,
    content: feedback.content,
    media,
    trackedBlocks,
    messages,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };
}
