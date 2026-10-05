import {
  AdjustmentLevel,
  type AdjustmentLevelType,
  type ExerciseBlocks,
  lockedShapeIssues,
} from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";

const LEVEL_LABEL = {
  [AdjustmentLevel.SESSION]: "séance",
  [AdjustmentLevel.SCHEDULED]: "séance planifiée",
} satisfies Record<AdjustmentLevelType, string>;

/**
 * Le verrou de forme d'un exercice dosé, aux DEUX niveaux éditables (#164, #518) : type de
 * structure, colonnes, nombre de blocs et libellés restent ceux de la référence.
 *
 * Vérifié ICI et pas seulement grisé dans l'UI : un formulaire n'est pas une frontière. Le message
 * nomme le niveau et ce qui a bougé, sinon le 400 est indébogable.
 */
export function assertShapeLocked(
  level: AdjustmentLevelType,
  baseline: ExerciseBlocks,
  blocks: ExerciseBlocks,
): void {
  const issues = lockedShapeIssues(baseline, blocks);
  if (issues.length > 0) {
    throw new BadRequestException(
      `Structure verrouillée au niveau ${LEVEL_LABEL[level]} : ${issues.join(", ")}`,
    );
  }
}
