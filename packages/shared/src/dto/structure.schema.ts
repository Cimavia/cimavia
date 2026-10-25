import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import { settingsIssues } from "../util/structure-settings.util";
import { exerciseTagsSchema } from "./exercise.schema";
import { expectedVersionSchema } from "./expected-version.schema";
import { StructureAdvance, StructureOrder, StructureRepeat } from "./structure-answer.schema";

// La structure d'un bloc de séance (#714, #715) : Séries, EMOM, AMRAP… et celles du Coach.
//
// Coexiste avec `BlockStructure` (`exercise-block.schema`), la structure portée par l'EXERCICE,
// jusqu'à #723. D'où les noms en `Structure*` : `BlockType`, `BlockStructure` et `BlockTimer`
// sont pris.
//
// Les réglages répondent à trois questions — quand passe-t-on à la suite, combien de fois, quels
// repos et quelle limite — plus l'ordre des exercices. La source de leurs règles est
// `docs/maquettes/composants/structure_model.js`.

export const STRUCTURE_NAME_MAX_LENGTH = 60;
export const STRUCTURE_NOTE_MAX_LENGTH = 2000;
export const STRUCTURE_INSTRUCTIONS_MAX_LENGTH = 2000;
/** Tours, séries, bips ou intervalles : la maquette borne le champ « nombre » de 1 à 99. */
export const STRUCTURE_MIN_ROUNDS = 1;
export const STRUCTURE_MAX_ROUNDS = 99;
/** Chaque durée d'un réglage — bip, effort, repos, limite : la maquette la borne de 1 s à 3 h. */
export const STRUCTURE_MIN_DURATION_SECONDS = 1;
export const STRUCTURE_MAX_DURATION_SECONDS = 3 * 60 * 60;

const durationSchema = z
  .number()
  .int()
  .min(STRUCTURE_MIN_DURATION_SECONDS)
  .max(STRUCTURE_MAX_DURATION_SECONDS);

// ── 1. Quand passe-t-on à la suite ? ────────────────────────────────────────────────────────

// Les durées vivent DANS la réponse qui les appelle : un EMOM sans intervalle, ou un intervalle
// posé sur « quand l'athlète a fini », ne peuvent pas s'écrire.
export const structureAdvanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(StructureAdvance.ATHLETE) }).strict(),
  z.object({ kind: z.literal(StructureAdvance.BEEP), everySeconds: durationSchema }).strict(),
  z
    .object({
      kind: z.literal(StructureAdvance.CYCLE),
      workSeconds: durationSchema,
      restSeconds: durationSchema,
    })
    .strict(),
]);

// ── 2. Combien de fois ? ────────────────────────────────────────────────────────────────────

export const structureRepeatSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal(StructureRepeat.ROUNDS),
      rounds: z.number().int().min(STRUCTURE_MIN_ROUNDS).max(STRUCTURE_MAX_ROUNDS),
    })
    .strict(),
  z.object({ kind: z.literal(StructureRepeat.MAX), capSeconds: durationSchema }).strict(),
  z.object({ kind: z.literal(StructureRepeat.ONCE) }).strict(),
]);

// ── Les réglages ────────────────────────────────────────────────────────────────────────────

/**
 * Les trois repos et la limite (question 3) sont `null` quand le Coach ne les pose pas. Un réglage
 * GRISÉ ne porte jamais de valeur : la refuser ici évite qu'une valeur cachée ressorte le jour où
 * le Coach change une autre réponse (`settingsIssues`).
 */
const structureSettingsShape = z
  .object({
    advance: structureAdvanceSchema,
    repeat: structureRepeatSchema,
    restBetweenExercisesSeconds: durationSchema.nullable(),
    restBetweenRoundsSeconds: durationSchema.nullable(),
    limitSeconds: durationSchema.nullable(),
    order: z.enum(StructureOrder),
  })
  .strict();
// Le type vient de la forme, pas du schéma raffiné : `settingsIssues` le reçoit, et le raffinement
// l'appelle — le déduire du schéma ferait référencer le type dans sa propre définition.
export type StructureSettings = z.infer<typeof structureSettingsShape>;

export const structureSettingsSchema = structureSettingsShape.superRefine((settings, context) => {
  for (const issue of settingsIssues(settings)) {
    context.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  }
});

// ── Les structures prêtes ───────────────────────────────────────────────────────────────────

/**
 * Les structures livrées, à clé STABLE : un bloc en garde l'origine (`sourcePreset`) pour le
 * compteur « Séances ». Séries et Circuit sont fusionnés — un circuit, c'est des Séries à
 * plusieurs exercices.
 */
export const StructurePresetKey = {
  SERIES: "SERIES",
  EMOM: "EMOM",
  AMRAP: "AMRAP",
  TABATA: "TABATA",
  FOR_TIME: "FOR_TIME",
  FREE: "FREE",
} as const;
export type StructurePresetKey = TypesValuesOf<typeof StructurePresetKey>;
export const structurePresetKeySchema = z.enum(StructurePresetKey);

const NO_REST = {
  restBetweenExercisesSeconds: null,
  restBetweenRoundsSeconds: null,
  limitSeconds: null,
  order: StructureOrder.ALL,
} as const;

/** Les structures prêtes n'ont ni tags, ni note, ni consigne : seulement des réglages. */
export const STRUCTURE_PRESETS = {
  [StructurePresetKey.SERIES]: {
    ...NO_REST,
    advance: { kind: StructureAdvance.ATHLETE },
    repeat: { kind: StructureRepeat.ROUNDS, rounds: 4 },
    restBetweenRoundsSeconds: 120,
  },
  [StructurePresetKey.EMOM]: {
    ...NO_REST,
    advance: { kind: StructureAdvance.BEEP, everySeconds: 60 },
    repeat: { kind: StructureRepeat.ROUNDS, rounds: 10 },
  },
  [StructurePresetKey.AMRAP]: {
    ...NO_REST,
    advance: { kind: StructureAdvance.ATHLETE },
    repeat: { kind: StructureRepeat.MAX, capSeconds: 720 },
  },
  [StructurePresetKey.TABATA]: {
    ...NO_REST,
    advance: { kind: StructureAdvance.CYCLE, workSeconds: 20, restSeconds: 10 },
    repeat: { kind: StructureRepeat.ROUNDS, rounds: 8 },
  },
  [StructurePresetKey.FOR_TIME]: {
    ...NO_REST,
    advance: { kind: StructureAdvance.ATHLETE },
    repeat: { kind: StructureRepeat.ROUNDS, rounds: 3 },
    limitSeconds: 900,
  },
  [StructurePresetKey.FREE]: {
    ...NO_REST,
    advance: { kind: StructureAdvance.ATHLETE },
    repeat: { kind: StructureRepeat.ONCE },
  },
} as const satisfies Record<StructurePresetKey, StructureSettings>;

/** Le nom d'une structure prête, dans la langue du Coach. */
export const STRUCTURE_PRESET_NAME_KEY = {
  SERIES: "block.preset.series",
  EMOM: "block.preset.emom",
  AMRAP: "block.preset.amrap",
  TABATA: "block.preset.tabata",
  FOR_TIME: "block.preset.forTime",
  FREE: "block.preset.free",
} as const satisfies Record<StructurePresetKey, string>;

// ── La structure du Coach ───────────────────────────────────────────────────────────────────

/**
 * Ce que le Coach enregistre dans sa bibliothèque. La note est PRIVÉE (l'athlète ne la lit
 * jamais) ; la consigne est pour l'athlète, et le bloc qui copie la structure l'emporte.
 */
export const structureInputSchema = z
  .object({
    name: z.string().trim().min(1).max(STRUCTURE_NAME_MAX_LENGTH),
    tags: exerciseTagsSchema,
    note: z.string().max(STRUCTURE_NOTE_MAX_LENGTH).nullable(),
    instructions: z.string().max(STRUCTURE_INSTRUCTIONS_MAX_LENGTH).nullable(),
    settings: structureSettingsSchema,
  })
  .strict();
export type StructureInput = z.infer<typeof structureInputSchema>;

/** Modifier une structure, sous la version lue (#604) : deux onglets ne s'écrasent pas. */
export const updateStructureSchema = structureInputSchema
  .extend({ expectedUpdatedAt: expectedVersionSchema })
  .strict();
export type UpdateStructureInput = z.infer<typeof updateStructureSchema>;

/**
 * Le compteur « Séances » : les séances-types dont un bloc vient de la structure, parmi celles que
 * le Coach peut lire. Les séances planifiées n'y comptent pas.
 */
const sessionCountSchema = z.number().int().nonnegative();

export const structureDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  note: z.string().nullable(),
  instructions: z.string().nullable(),
  settings: structureSettingsSchema,
  sessionCount: sessionCountSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type StructureDto = z.infer<typeof structureDtoSchema>;

/** Bibliothèque › Structures : les structures prêtes, dans leur ordre, puis celles du Coach. */
export const structureLibraryDtoSchema = z.object({
  presets: z.array(z.object({ key: structurePresetKeySchema, sessionCount: sessionCountSchema })),
  structures: z.array(structureDtoSchema),
});
export type StructureLibraryDto = z.infer<typeof structureLibraryDtoSchema>;
