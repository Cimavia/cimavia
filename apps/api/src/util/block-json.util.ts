import {
  type BlockGrid,
  type BlockReference,
  blockGridSchema,
  blockReferenceSchema,
  type SessionBlockTracking,
  type StructureSettings,
  sessionBlockTrackingSchema,
  structureSettingsSchema,
} from "@cmv/shared";
import type { Prisma } from "@prisma/client";

/**
 * Les colonnes JSON des blocs de séance (#716) — réglages, grille, référence reçue, suivi. Même
 * contrat que `exercise-json.util` : le schéma partagé à la lecture, et l'échec qui remonte. La
 * donnée n'entre que par l'API validée ou par la migration de reprise : un JSON illisible est un
 * bug, pas un cas à absorber.
 */

export function parseSettings(value: Prisma.JsonValue): StructureSettings {
  return structureSettingsSchema.parse(value);
}

export function parseGrid(value: Prisma.JsonValue): BlockGrid {
  return blockGridSchema.parse(value);
}

export function parseBlockReference(value: Prisma.JsonValue): BlockReference {
  return blockReferenceSchema.parse(value);
}

/** `null` traverse INTACT : c'est « non suivi », pas « rien coché ». */
export function parseBlockTracking(value: Prisma.JsonValue): SessionBlockTracking | null {
  return value === null ? null : sessionBlockTrackingSchema.parse(value);
}

/**
 * Le passage vers `InputJsonValue`, pour les mêmes raisons que `toBlocksInput` : sans retour
 * explicite, le littéral garde le type Zod et Prisma le refuse.
 */
export function toJsonInput(
  value: StructureSettings | BlockGrid | BlockReference | SessionBlockTracking,
): Prisma.InputJsonValue {
  return value;
}
