import { z } from "zod";
import { blockGridSchema } from "./block-grid.schema";
import { sessionBlockTrackingSchema } from "./block-tracking.schema";
import { compositionOriginSchema } from "./session-block.schema";
import { structurePresetKeySchema, structureSettingsSchema } from "./structure.schema";

// Les blocs tels que l'API les rend (#716) : ceux de la séance-type et ceux d'une séance planifiée.
//
// Un exercice de bloc ne répète pas le contenu de l'exercice — titre, consigne, documents, tags :
// son `id` est celui de la ligne que la séance rend déjà dans `exercises`, qui le porte. Les deux
// listes cohabitent jusqu'au retrait de l'ancien modèle (#723).

const blockDtoFields = {
  id: z.string(),
  name: z.string(),
  label: z.string().nullable(),
  instructions: z.string().nullable(),
  settings: structureSettingsSchema,
  copiedSettings: structureSettingsSchema,
  sourceStructureId: z.string().nullable(),
  sourcePreset: structurePresetKeySchema.nullable(),
};

const blockExerciseDtoFields = {
  id: z.string(),
  key: z.string(),
  note: z.string().nullable(),
  grid: blockGridSchema,
};

export const sessionBlockDtoSchema = z.object({
  ...blockDtoFields,
  exercises: z.array(z.object({ ...blockExerciseDtoFields, exerciseId: z.string() })),
});
export type SessionBlockDto = z.infer<typeof sessionBlockDtoSchema>;

/**
 * Ce que la séance planifiée a REÇU d'un bloc : la référence contre laquelle sa composition et ses
 * valeurs se comptent (`plannedChanges`). Elle garde un exercice retiré depuis, que la séance n'a
 * plus. `exerciseId` est `null` quand l'exercice reçu n'avait plus de source dans la bibliothèque.
 *
 * Relu depuis la base, il n'est pas strict : un champ ajouté plus tard est retiré de la lecture,
 * comme pour le suivi.
 */
export const blockReferenceSchema = z.object({
  settings: structureSettingsSchema,
  exercises: z.array(
    z.object({
      key: z.string().min(1),
      exerciseId: z.string().min(1).nullable(),
      note: z.string().nullable(),
      grid: blockGridSchema,
    }),
  ),
});
export type BlockReference = z.infer<typeof blockReferenceSchema>;

export const scheduledSessionBlockDtoSchema = z.object({
  ...blockDtoFields,
  baseline: blockReferenceSchema,
  /** `null` = NON SUIVI, ce qui n'est pas « rien coché ». */
  tracking: sessionBlockTrackingSchema.nullable(),
  exercises: z.array(z.object({ ...blockExerciseDtoFields, origin: compositionOriginSchema })),
});
export type ScheduledSessionBlockDto = z.infer<typeof scheduledSessionBlockDtoSchema>;
