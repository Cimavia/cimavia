import type {
  FeedbackMediaDto,
  MessageDto,
  SessionFeedbackDto,
  TrackedBlockDto,
  TrackedExerciseDto,
} from "@cmv/shared";
import { required, trackingSummary } from "@cmv/shared";
import type {
  FeedbackMedia,
  Prisma,
  ScheduledSessionBlock,
  ScheduledSessionExercise,
} from "@prisma/client";
import type { StorageService } from "../infra/storage/storage.service";
import { parseBlockTracking, parseSettings } from "../util/block-json.util";
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
  return rows.map((row) => required(row.key, "[feedback] ligne de bloc sans clé"));
}

/**
 * Le suivi par bloc (#722), bloc par bloc : la matière de ses cases et de son décompte, que chaque
 * app rend dans sa langue (`blockChecks`, `blockTally`). Même raison que `toTrackedExercises` : le
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

/** Le suivi qui accompagne un débrief : par exercice (ancien modèle), et par bloc (#722). */
export type FeedbackTracked = {
  trackedExercises: TrackedExerciseDto[];
  trackedBlocks: TrackedBlockDto[];
};

const NOTHING_TRACKED: FeedbackTracked = { trackedExercises: [], trackedBlocks: [] };

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
  tracked: FeedbackTracked = NOTHING_TRACKED,
  messages: MessageDto[] = [],
): Promise<SessionFeedbackDto> {
  const media = await Promise.all(feedback.media.map((item) => toFeedbackMediaDto(item, storage)));
  return {
    id: feedback.id,
    scheduledSessionId: feedback.scheduledSessionId,
    athleteId: feedback.athleteId,
    content: feedback.content,
    media,
    trackedExercises: tracked.trackedExercises,
    trackedBlocks: tracked.trackedBlocks,
    messages,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };
}
