import type { BlockGrid } from "@cmv/shared";
import { CompositionOrigin, required } from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { citedCustomMetrics, gridCatalogOf } from "../custom-metric/custom-metric.mapper";
import type { CustomMetricService } from "../custom-metric/service/custom-metric.service";
import type { ExerciseService } from "../exercise/service/exercise.service";
import { receivedBlockOf, SESSION_BLOCKS_INCLUDE } from "../session/session-block.mapper";
import type { TenantPrisma } from "../tenancy/tenancy.extension";
import { parseGrid } from "../util/block-json.util";
import { parseInstructions } from "../util/exercise-json.util";
import type {
  BlockPlacementDraft,
  ScheduledBlockDraft,
  ScheduledSessionExerciseDraft,
} from "./scheduled-session.writer";

/** La séance telle qu'elle sera écrite : un instantané, plus aucune référence à résoudre. */
export type SessionDraft = {
  title: string;
  notes: string | null;
  exercises: ScheduledSessionExerciseDraft[];
  /** Les blocs reçus de la séance-type (#716). */
  blocks: ScheduledBlockDraft[];
};

/** Ce que la copie lit : la séance-type, ses exercices, et les catalogues de métriques cités. */
export type DraftSources = {
  db: TenantPrisma;
  library: Pick<ExerciseService, "loadAccessibleOrThrow">;
  metrics: Pick<CustomMetricService, "catalogOf">;
};

/**
 * Résout ce qui sera écrit : la copie de la séance-type, que le Coach ajuste ensuite dans la
 * séance planifiée — c'est déjà une instance, pas une référence.
 */
export async function buildSessionDraft(
  { db, library, metrics }: DraftSources,
  sourceSessionId: string,
): Promise<SessionDraft> {
  const template = await db.session.findFirst({
    where: { id: sourceSessionId },
    include: { exercises: { orderBy: { position: "asc" } }, blocks: SESSION_BLOCKS_INCLUDE },
  });
  if (template == null) {
    throw new BadRequestException("Séance modèle inconnue");
  }

  // Prouvés accessibles, et lus à travers le modèle quand ils ne le sont que par lui : un
  // exercice privé de C, dans la séance qu'il ouvre à F, se recopie dans la planification de M.
  const exercisesById = await library.loadAccessibleOrThrow(
    template.exercises.map((e) => e.exerciseId),
    template.id,
  );
  // Chargés UNE fois pour toute la séance, chez le propriétaire de chaque exercice (piège n°9) :
  // le modèle peut composer l'exercice d'un autre Coach, qui cite son catalogue. Et celui du
  // propriétaire du modèle, que citent aussi les grilles de ses blocs (#716).
  const catalogOf = await metrics.catalogOf([
    template.coachId,
    ...[...exercisesById.values()].map((exercise) => exercise.coachId),
  ]);
  const blockIndex = new Map(template.blocks.map((block, index) => [block.id, index]));
  const exercises = template.exercises.map((composed): ScheduledSessionExerciseDraft => {
    const exercise = required(
      exercisesById.get(composed.exerciseId),
      `[plan] exercice ${composed.exerciseId} absent des exercices chargés`,
    );
    const grid = parseGrid(composed.grid);
    return {
      exercise: {
        sourceExerciseId: exercise.id,
        title: exercise.title,
        description: exercise.description,
        // La consigne vient de la BIBLIOTHÈQUE : elle n'est pas surchargeable au niveau séance,
        // donc la séance n'en garde aucune copie. Elle se fige ici, dans le snapshot de l'athlète.
        instructions: parseInstructions(exercise.instructions),
        // Les définitions des métriques maison partent AVEC la copie : sans elles l'athlète ne
        // verrait qu'un identifiant, et renommer la métrique dégraderait une planif diffusée.
        customMetrics: citedCustomMetrics(
          [grid],
          gridCatalogOf(catalogOf, exercise.coachId, template.coachId),
        ),
        tags: exercise.tags.map((tag) => tag.name).sort(),
        note: composed.note,
      },
      documents: exercise.documents,
      // Le dosage vient de la SÉANCE, pas de l'exercice : sa grille, recopiée telle quelle.
      placement: receivedPlacementOf(composed, grid, blockIndex),
    };
  });

  return {
    title: template.title,
    notes: template.notes,
    exercises,
    blocks: template.blocks.map(receivedBlockOf),
  };
}

/** La place qu'un exercice de bloc de la séance-type prend dans la séance planifiée : la même, et REÇU (#716). */
function receivedPlacementOf(
  composed: { id: string; blockId: string; blockPosition: number; key: string },
  grid: BlockGrid,
  blockIndex: ReadonlyMap<string, number>,
): BlockPlacementDraft {
  return {
    block: required(
      blockIndex.get(composed.blockId),
      `[plan] l'exercice de bloc ${composed.id} sans bloc lu`,
    ),
    blockPosition: composed.blockPosition,
    key: composed.key,
    grid,
    origin: CompositionOrigin.RECEIVED,
    replacesKey: null,
  };
}
