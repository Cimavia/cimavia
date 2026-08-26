import {
  type Adjustments,
  adjustmentsSchema,
  type CustomMetric,
  customMetricSchema,
  type ExerciseBlocks,
  exerciseBlocksSchema,
  type RichDocument,
  richDocumentSchema,
} from "@cmv/shared";
import { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * Consigne structurée et blocs vivent en colonnes JSON (décision tranchée : voir
 * `docs/dette-technique.md` § « Refonte du modèle d'exercice »). Prisma les rend en `JsonValue`,
 * sans contrat, et les attend en `InputJsonValue`, qu'un type Zod ne satisfait pas seul.
 *
 * Ces quatre fonctions sont le SEUL passage entre les deux mondes. Elles vivent ici et non dans
 * `exercise.mapper` parce que la planification en a autant besoin que la bibliothèque : une séance
 * diffusée copie la consigne et les blocs de l'exercice source.
 */

/**
 * Repasse par le schéma Zod à la LECTURE, et laisse l'échec remonter.
 *
 * Un `safeParse` avec repli sur `null` serait plus doux, et c'est précisément le problème : la
 * consigne d'un coach disparaîtrait de l'écran sans que personne l'apprenne. La donnée n'entre que
 * par l'API validée ou par la migration de reprise — un document illisible est donc un BUG, et un
 * 500 est la réponse honnête.
 */
export function parseInstructions(value: Prisma.JsonValue): RichDocument | null {
  return value === null ? null : richDocumentSchema.parse(value);
}

export function parseBlocks(value: Prisma.JsonValue): ExerciseBlocks {
  return exerciseBlocksSchema.parse(value);
}

/**
 * `Prisma.DbNull` et non `null` : sur une colonne JSON nullable, Prisma distingue le NULL SQL
 * (la consigne n'existe pas) du littéral JSON `null` (elle existe et vaut null). Passer `null`
 * tel quel est refusé à la compilation, et c'est heureux — les deux ne se relisent pas pareil.
 */
export function toInstructionsInput(
  instructions: RichDocument | null,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return instructions === null ? Prisma.DbNull : instructions;
}

/**
 * N'a l'air de rien et n'est pas supprimable : sans ce passage explicite par `InputJsonValue`, le
 * littéral de données porte le type Zod des blocs, et sa conversion vers l'`UncheckedCreateInput`
 * de Prisma est refusée — TypeScript ne juge plus les deux types comparables. Le retour explicite
 * fixe le type AVANT que le littéral ne soit construit.
 */
export function toBlocksInput(blocks: ExerciseBlocks): Prisma.InputJsonValue {
  return blocks;
}

/**
 * Les ajustements de dosage, même trajet que les blocs : `JsonValue` à la lecture, `InputJsonValue`
 * à l'écriture, et le schéma partagé comme seul contrat.
 */
export function parseAdjustments(value: Prisma.JsonValue): Adjustments {
  return adjustmentsSchema.parse(value);
}

export function toAdjustmentsInput(adjustments: Adjustments): Prisma.InputJsonValue {
  return adjustments;
}

/** Les définitions de métriques maison copiées dans un snapshot, même trajet que les blocs. */
export function parseCustomMetrics(value: Prisma.JsonValue): CustomMetric[] {
  return z.array(customMetricSchema).parse(value);
}

export function toCustomMetricsInput(metrics: readonly CustomMetric[]): Prisma.InputJsonValue {
  return metrics as Prisma.InputJsonValue;
}
