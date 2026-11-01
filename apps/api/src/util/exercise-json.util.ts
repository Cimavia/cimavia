import {
  type CustomMetric,
  customMetricSchema,
  type RichDocument,
  richDocumentSchema,
  type SuggestedMetric,
  suggestedMetricsSchema,
} from "@cmv/shared";
import { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * Consigne structurée, métriques suggérées et métriques maison copiées vivent en colonnes JSON
 * (décision tranchée : voir `docs/dette/seances-et-exercices.md` § « Refonte du modèle
 * d'exercice »). Prisma les rend en `JsonValue`, sans contrat, et les attend en `InputJsonValue`,
 * qu'un type Zod ne satisfait pas seul.
 *
 * Ces fonctions sont le SEUL passage entre les deux mondes. Elles vivent ici et non dans
 * `exercise.mapper` parce que la planification en a autant besoin que la bibliothèque : une séance
 * diffusée copie la consigne de l'exercice source.
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

/** Les métriques suggérées d'un exercice (#718), même trajet que la consigne. */
export function parseSuggestedMetrics(value: Prisma.JsonValue): SuggestedMetric[] {
  return suggestedMetricsSchema.parse(value);
}

/**
 * Repasse par le schéma à l'ÉCRITURE aussi : la copie entre Coachs les réécrit sans corps de
 * requête validé, et une liste invalide stockée ferait tomber en 500 toute la bibliothèque qui la
 * lit — mieux vaut refuser l'écriture.
 */
export function toSuggestedMetricsInput(
  metrics: readonly SuggestedMetric[],
): Prisma.InputJsonValue {
  return suggestedMetricsSchema.parse(metrics);
}

/**
 * `Prisma.DbNull` et non `null` : sur une colonne JSON nullable, Prisma distingue le NULL SQL
 * (la consigne n'existe pas) du littéral JSON `null` (elle existe et vaut null). Passer `null`
 * tel quel est refusé à la compilation, et c'est heureux — les deux ne se relisent pas pareil.
 */
export function toInstructionsInput(
  instructions: RichDocument | null,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return instructions ?? Prisma.DbNull;
}

/** Les définitions de métriques maison copiées dans un snapshot, même trajet que la consigne. */
export function parseCustomMetrics(value: Prisma.JsonValue): CustomMetric[] {
  return z.array(customMetricSchema).parse(value);
}

export function toCustomMetricsInput(metrics: readonly CustomMetric[]): Prisma.InputJsonValue {
  return metrics as Prisma.InputJsonValue;
}
