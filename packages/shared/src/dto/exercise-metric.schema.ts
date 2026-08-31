import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

// Vocabulaire des métriques d'un exercice structuré (refonte #162).
//
// Une métrique est UNE COLONNE de la grille : « Répétitions », « Charge », « Repos ». Elle a un
// type de valeur qui détermine la saisie, le rendu et le tri ; une unité choisie parmi celles que
// la métrique admet ; et, pour les cotations, une échelle ORDONNÉE.
//
// L'ordre des paliers d'une échelle n'est pas décoratif : c'est lui qui rend possible
// « progression sur l'échelle » (de 5a à 6b) dans le remplissage de colonne. Une échelle est
// donc une liste, jamais un ensemble.

export const CUSTOM_METRIC_LABEL_MAX_LENGTH = 60;
export const CUSTOM_METRIC_UNIT_MAX_LENGTH = 12;
export const SCALE_STEP_MAX_LENGTH = 12;
export const SCALE_MAX_STEPS = 100;
export const METRIC_TEXT_VALUE_MAX_LENGTH = 200;

export const MetricValueType = {
  NUMBER: "NUMBER",
  DURATION: "DURATION",
  TEXT: "TEXT",
  SCALE: "SCALE",
} as const;
export type MetricValueType = TypesValuesOf<typeof MetricValueType>;
export const metricValueTypeSchema = z.enum(MetricValueType);

// Les familles regroupent les métriques dans le sélecteur. « Repères » n'est ni une mesure ni un
// dosage : c'est du texte pour situer la ligne — le nom d'une voie, une note.
export const MetricFamily = {
  VOLUME: "VOLUME",
  INTENSITY: "INTENSITY",
  RECOVERY: "RECOVERY",
  EXECUTION: "EXECUTION",
  MARKER: "MARKER",
} as const;
export type MetricFamily = TypesValuesOf<typeof MetricFamily>;
export const metricFamilySchema = z.enum(MetricFamily);

// `NONE` n'est pas un trou : une durée, un tempo ou une cotation n'ont pas d'unité à afficher.
export const MetricUnit = {
  NONE: "NONE",
  REPS: "REPS",
  REPS_PER_SIDE: "REPS_PER_SIDE",
  ROUNDS: "ROUNDS",
  METERS: "METERS",
  KILOMETERS: "KILOMETERS",
  MILLIMETERS: "MILLIMETERS",
  KILOGRAMS: "KILOGRAMS",
  KILOGRAMS_ADDED: "KILOGRAMS_ADDED",
  PERCENT: "PERCENT",
  PERCENT_BODYWEIGHT: "PERCENT_BODYWEIGHT",
  PERCENT_HR_MAX: "PERCENT_HR_MAX",
  BPM: "BPM",
  DEGREES: "DEGREES",
} as const;
export type MetricUnit = TypesValuesOf<typeof MetricUnit>;
export const metricUnitSchema = z.enum(MetricUnit);

export const MetricKey = {
  REPETITIONS: "REPETITIONS",
  EFFORT_DURATION: "EFFORT_DURATION",
  DISTANCE: "DISTANCE",
  ROUNDS: "ROUNDS",
  LOAD: "LOAD",
  PERCENT_RM: "PERCENT_RM",
  RPE: "RPE",
  HEART_RATE: "HEART_RATE",
  PACE: "PACE",
  GRADE: "GRADE",
  INCLINE: "INCLINE",
  REST_BETWEEN_SETS: "REST_BETWEEN_SETS",
  REST_BETWEEN_ROUNDS: "REST_BETWEEN_ROUNDS",
  TEMPO: "TEMPO",
  EDGE_SIZE: "EDGE_SIZE",
  PASS_COUNT: "PASS_COUNT",
  LABEL: "LABEL",
  NOTE: "NOTE",
} as const;
export type MetricKey = TypesValuesOf<typeof MetricKey>;
export const metricKeySchema = z.enum(MetricKey);

type MetricDefinition = {
  readonly family: MetricFamily;
  readonly valueType: MetricValueType;
  /** Unités admises. La PREMIÈRE est le défaut ; `[NONE]` quand la métrique n'en a pas. */
  readonly units: readonly MetricUnit[];
};

// Catalogue livré. Une métrique personnalisée du coach vit à côté (`customMetricSchema`) et n'y
// entre jamais : ce catalogue est du code, le sien est de la donnée.
export const METRIC_CATALOG = {
  [MetricKey.REPETITIONS]: {
    family: MetricFamily.VOLUME,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.REPS, MetricUnit.REPS_PER_SIDE],
  },
  [MetricKey.EFFORT_DURATION]: {
    family: MetricFamily.VOLUME,
    valueType: MetricValueType.DURATION,
    units: [MetricUnit.NONE],
  },
  [MetricKey.DISTANCE]: {
    family: MetricFamily.VOLUME,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.METERS, MetricUnit.KILOMETERS],
  },
  [MetricKey.ROUNDS]: {
    family: MetricFamily.VOLUME,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.ROUNDS],
  },
  [MetricKey.LOAD]: {
    family: MetricFamily.INTENSITY,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.KILOGRAMS, MetricUnit.KILOGRAMS_ADDED, MetricUnit.PERCENT_BODYWEIGHT],
  },
  [MetricKey.PERCENT_RM]: {
    family: MetricFamily.INTENSITY,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.PERCENT],
  },
  [MetricKey.RPE]: {
    family: MetricFamily.INTENSITY,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.NONE],
  },
  [MetricKey.HEART_RATE]: {
    family: MetricFamily.INTENSITY,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.BPM, MetricUnit.PERCENT_HR_MAX],
  },
  [MetricKey.PACE]: {
    family: MetricFamily.INTENSITY,
    valueType: MetricValueType.TEXT,
    units: [MetricUnit.NONE],
  },
  [MetricKey.GRADE]: {
    family: MetricFamily.INTENSITY,
    valueType: MetricValueType.SCALE,
    units: [MetricUnit.NONE],
  },
  [MetricKey.INCLINE]: {
    family: MetricFamily.INTENSITY,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.PERCENT, MetricUnit.DEGREES],
  },
  [MetricKey.REST_BETWEEN_SETS]: {
    family: MetricFamily.RECOVERY,
    valueType: MetricValueType.DURATION,
    units: [MetricUnit.NONE],
  },
  [MetricKey.REST_BETWEEN_ROUNDS]: {
    family: MetricFamily.RECOVERY,
    valueType: MetricValueType.DURATION,
    units: [MetricUnit.NONE],
  },
  [MetricKey.TEMPO]: {
    family: MetricFamily.EXECUTION,
    valueType: MetricValueType.TEXT,
    units: [MetricUnit.NONE],
  },
  [MetricKey.EDGE_SIZE]: {
    family: MetricFamily.EXECUTION,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.MILLIMETERS],
  },
  [MetricKey.PASS_COUNT]: {
    family: MetricFamily.EXECUTION,
    valueType: MetricValueType.NUMBER,
    units: [MetricUnit.NONE],
  },
  [MetricKey.LABEL]: {
    family: MetricFamily.MARKER,
    valueType: MetricValueType.TEXT,
    units: [MetricUnit.NONE],
  },
  [MetricKey.NOTE]: {
    family: MetricFamily.MARKER,
    valueType: MetricValueType.TEXT,
    units: [MetricUnit.NONE],
  },
} as const satisfies Record<MetricKey, MetricDefinition>;

// Clés i18n, jamais le texte rendu — même motif que NOTIFICATION_LABEL_KEY.
export const METRIC_LABEL_KEY = {
  [MetricKey.REPETITIONS]: "exercise.metric.repetitions",
  [MetricKey.EFFORT_DURATION]: "exercise.metric.effortDuration",
  [MetricKey.DISTANCE]: "exercise.metric.distance",
  [MetricKey.ROUNDS]: "exercise.metric.rounds",
  [MetricKey.LOAD]: "exercise.metric.load",
  [MetricKey.PERCENT_RM]: "exercise.metric.percentRm",
  [MetricKey.RPE]: "exercise.metric.rpe",
  [MetricKey.HEART_RATE]: "exercise.metric.heartRate",
  [MetricKey.PACE]: "exercise.metric.pace",
  [MetricKey.GRADE]: "exercise.metric.grade",
  [MetricKey.INCLINE]: "exercise.metric.incline",
  [MetricKey.REST_BETWEEN_SETS]: "exercise.metric.restBetweenSets",
  [MetricKey.REST_BETWEEN_ROUNDS]: "exercise.metric.restBetweenRounds",
  [MetricKey.TEMPO]: "exercise.metric.tempo",
  [MetricKey.EDGE_SIZE]: "exercise.metric.edgeSize",
  [MetricKey.PASS_COUNT]: "exercise.metric.passCount",
  [MetricKey.LABEL]: "exercise.metric.label",
  [MetricKey.NOTE]: "exercise.metric.note",
} as const satisfies Record<MetricKey, string>;

export const METRIC_UNIT_LABEL_KEY = {
  [MetricUnit.NONE]: "exercise.unit.none",
  [MetricUnit.REPS]: "exercise.unit.reps",
  [MetricUnit.REPS_PER_SIDE]: "exercise.unit.repsPerSide",
  [MetricUnit.ROUNDS]: "exercise.unit.rounds",
  [MetricUnit.METERS]: "exercise.unit.meters",
  [MetricUnit.KILOMETERS]: "exercise.unit.kilometers",
  [MetricUnit.MILLIMETERS]: "exercise.unit.millimeters",
  [MetricUnit.KILOGRAMS]: "exercise.unit.kilograms",
  [MetricUnit.KILOGRAMS_ADDED]: "exercise.unit.kilogramsAdded",
  [MetricUnit.PERCENT]: "exercise.unit.percent",
  [MetricUnit.PERCENT_BODYWEIGHT]: "exercise.unit.percentBodyweight",
  [MetricUnit.PERCENT_HR_MAX]: "exercise.unit.percentHrMax",
  [MetricUnit.BPM]: "exercise.unit.bpm",
  [MetricUnit.DEGREES]: "exercise.unit.degrees",
} as const satisfies Record<MetricUnit, string>;

export function defaultUnitOf(key: MetricKey): MetricUnit {
  return METRIC_CATALOG[key].units[0];
}

export function metricAcceptsUnit(key: MetricKey, unit: MetricUnit): boolean {
  return (METRIC_CATALOG[key].units as readonly MetricUnit[]).includes(unit);
}

// ── Échelles ordonnées ──────────────────────────────────────────────────────────────────────

const scaleStepSchema = z.string().min(1).max(SCALE_STEP_MAX_LENGTH);

/**
 * Les paliers, DANS L'ORDRE croissant. Le doublon est refusé : deux paliers identiques rendraient
 * « progression sur l'échelle » ambiguë, et l'ordre indéterminé au tri.
 */
export const orderedScaleSchema = z
  .array(scaleStepSchema)
  .min(2)
  .max(SCALE_MAX_STEPS)
  .refine((steps) => new Set(steps).size === steps.length, {
    message: "Les paliers d'une échelle doivent être distincts.",
  });
export type OrderedScale = z.infer<typeof orderedScaleSchema>;

// Cotations livrées. Ce sont des échelles PRÉ-REMPLIES, pas des constantes du produit : le coach
// les duplique pour les adapter. Rien dans le code ne suppose qu'une cotation est l'une des deux.
export const FRENCH_CLIMBING_SCALE = [
  "5a",
  "5b",
  "5c",
  "6a",
  "6a+",
  "6b",
  "6b+",
  "6c",
  "6c+",
  "7a",
  "7a+",
  "7b",
  "7b+",
  "7c",
  "7c+",
  "8a",
  "8a+",
  "8b",
  "8b+",
  "8c",
  "8c+",
  "9a",
  "9a+",
  "9b",
  "9b+",
  "9c",
] as const satisfies readonly string[];

export const V_BOULDERING_SCALE = Array.from(
  { length: 18 },
  (_, index) => `V${index}`,
) as readonly string[];

/** Position d'un palier, ou `null` s'il n'appartient pas à l'échelle. */
export function scaleStepIndex(scale: OrderedScale, step: string): number | null {
  const index = scale.indexOf(step);
  return index === -1 ? null : index;
}

// ── Métrique personnalisée ──────────────────────────────────────────────────────────────────

/**
 * Une métrique définie par le coach. Son libellé et son unité sont SA donnée — donc du texte
 * libre, jamais une clé i18n : « Cotation maison » ne se traduit pas.
 *
 * `scale` n'existe que pour le type SCALE, et est exigée dans ce cas : une échelle sans paliers
 * ne permettrait aucune saisie.
 */
// La définition, sans l'identifiant : la création ne le porte pas, la base l'attribue.
const customMetricShape = {
  label: z.string().min(1).max(CUSTOM_METRIC_LABEL_MAX_LENGTH),
  unit: z.string().max(CUSTOM_METRIC_UNIT_MAX_LENGTH).nullable(),
  valueType: metricValueTypeSchema,
  scale: orderedScaleSchema.nullable(),
};

const SCALE_INVARIANT = {
  message: "Une métrique d'échelle exige des paliers, et elle seule.",
  path: ["scale"],
};

function holdsScaleInvariant(metric: { valueType: MetricValueType; scale: OrderedScale | null }) {
  return (metric.valueType === MetricValueType.SCALE) === (metric.scale !== null);
}

export const customMetricSchema = z
  .object({ id: z.string().min(1), ...customMetricShape })
  .strict()
  .refine(holdsScaleInvariant, SCALE_INVARIANT);
export type CustomMetric = z.infer<typeof customMetricSchema>;

export const createCustomMetricSchema = z
  .object(customMetricShape)
  .strict()
  .refine(holdsScaleInvariant, SCALE_INVARIANT);
export type CreateCustomMetricInput = z.infer<typeof createCustomMetricSchema>;

/**
 * La mise à jour REMPLACE la définition entière, elle ne la rapièce pas. `valueType` et `scale`
 * sont liés par un invariant : accepter un patch partiel laisserait passer « passe en SCALE »
 * sans paliers, ou « retire les paliers » sans changer de type. Quatre champs ne valent pas ce
 * risque — le formulaire les tient tous les quatre de toute façon.
 */
export const updateCustomMetricSchema = createCustomMetricSchema;
export type UpdateCustomMetricInput = z.infer<typeof updateCustomMetricSchema>;

// ── Valeur d'une cellule ────────────────────────────────────────────────────────────────────

/**
 * Une cellule vaut un nombre, du texte, ou RIEN. `null` est légitime et fréquent — la dernière
 * série n'a pas de repos, un étirement n'a pas de charge — et se rend « — », jamais « 0 »
 * (règle dure n°5).
 *
 * Une durée est stockée en SECONDES, donc en nombre : la forme « 2'30 » est un affichage
 * (`formatTrainingDuration`), pas un format de stockage.
 */
export const metricValueSchema = z.union([z.number(), z.string()]).nullable();
export type MetricValue = z.infer<typeof metricValueSchema>;

/**
 * Le schéma d'une cellule POUR un type de valeur donné. Sert à valider une grille contre ses
 * colonnes : sans ce croisement, rien n'empêcherait d'écrire « lourd » dans une colonne de charge.
 */
export function metricValueSchemaFor(
  valueType: MetricValueType,
  scale?: OrderedScale | null,
): z.ZodType<MetricValue> {
  switch (valueType) {
    case MetricValueType.NUMBER:
      return z.number().nullable();
    case MetricValueType.DURATION:
      return z.number().int().min(0).nullable();
    case MetricValueType.TEXT:
      return z.string().max(METRIC_TEXT_VALUE_MAX_LENGTH).nullable();
    case MetricValueType.SCALE:
      // Sans échelle fournie, on ne peut vérifier que la forme : la valeur est un palier, et
      // l'appartenance sera contrôlée là où l'échelle est connue.
      return scale
        ? z
            .string()
            .nullable()
            .refine((value) => value === null || scale.includes(value), {
              message: "Ce palier n'appartient pas à l'échelle de la colonne.",
            })
        : z.string().max(SCALE_STEP_MAX_LENGTH).nullable();
  }
}
