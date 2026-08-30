import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import {
  formatTrainingDuration,
  TRAINING_DURATION_MAX_SECONDS,
} from "../util/training-duration.util";
import {
  type CustomMetric,
  METRIC_CATALOG,
  MetricKey,
  type MetricValue,
  type MetricValueType,
  metricAcceptsUnit,
  metricKeySchema,
  metricUnitSchema,
  metricValueSchema,
  metricValueSchemaFor,
  type OrderedScale,
  scaleStepIndex,
} from "./exercise-metric.schema";

// Blocs de structure d'un exercice (refonte #162).
//
// Un exercice porte N blocs ORDONNÉS. Chaque bloc a un type, ses paramètres propres — ce que la
// maquette appelle le « bandeau » —, ses colonnes et ses lignes. Un exercice à deux blocs, c'est
// « Échauffement » puis « Travail » : deux dosages sous un même titre, avec chacun SES colonnes.
//
// Cinq types, et cinq seulement. Pyramide et Intervalles ne sont PAS des types : ce sont des
// raccourcis de saisie du constructeur qui engendrent des Séries. Rien ici ne les connaît.

// Un exercice se découpe en échauffement / travail / retour au calme, pas en vingt temps. Le
// plafond existe surtout parce que ce tableau devient une colonne en base : sans lui, une requête
// forgée y écrit un document arbitrairement gros.
export const EXERCISE_MAX_BLOCKS = 20;
export const BLOCK_LABEL_MAX_LENGTH = 60;
export const BLOCK_MAX_METRICS = 12;
export const BLOCK_MAX_ROWS = 200;
export const BLOCK_MAX_SET_COUNT = 100;
export const BLOCK_MAX_ROUND_COUNT = 100;
export const BLOCK_MAX_TARGET_ROUNDS = 999;
export const EMOM_MIN_INTERVAL_SECONDS = 5;

export const BlockType = {
  SERIES: "SERIES",
  EMOM: "EMOM",
  AMRAP: "AMRAP",
  CIRCUIT: "CIRCUIT",
  FREE: "FREE",
} as const;
export type BlockType = TypesValuesOf<typeof BlockType>;
export const blockTypeSchema = z.enum(BlockType);

const durationSecondsSchema = z.number().int().min(0).max(TRAINING_DURATION_MAX_SECONDS);

// ── Le bandeau, propre à chaque type ────────────────────────────────────────────────────────

// Séries : N répétitions du même effort, avec un repos entre elles. Le repos est nullable — la
// dernière série n'en a pas, et certains coachs ne l'imposent pas du tout.
export const seriesStructureSchema = z
  .object({
    type: z.literal(BlockType.SERIES),
    setCount: z.number().int().min(1).max(BLOCK_MAX_SET_COUNT),
    restBetweenSetsSeconds: durationSecondsSchema.nullable(),
  })
  .strict();

// EMOM : un effort au début de chaque intervalle, pendant une durée totale. Le nombre de tops
// n'est PAS stocké — il se dérive (`emomTopCount`), sinon il finirait par mentir.
export const emomStructureSchema = z
  .object({
    type: z.literal(BlockType.EMOM),
    intervalSeconds: z
      .number()
      .int()
      .min(EMOM_MIN_INTERVAL_SECONDS)
      .max(TRAINING_DURATION_MAX_SECONDS),
    totalDurationSeconds: durationSecondsSchema,
  })
  .strict()
  .refine((structure) => structure.totalDurationSeconds >= structure.intervalSeconds, {
    message: "La durée totale d'un EMOM doit couvrir au moins un intervalle.",
    path: ["totalDurationSeconds"],
  });

// AMRAP : un maximum de tours dans un temps imparti. L'objectif est INDICATIF — il oriente
// l'athlète, il ne définit pas une réussite, et reste donc nullable.
export const amrapStructureSchema = z
  .object({
    type: z.literal(BlockType.AMRAP),
    totalDurationSeconds: durationSecondsSchema,
    targetRounds: z.number().int().min(1).max(BLOCK_MAX_TARGET_ROUNDS).nullable(),
  })
  .strict();

// Circuit : une suite d'étapes enchaînées, répétée en tours.
export const circuitStructureSchema = z
  .object({
    type: z.literal(BlockType.CIRCUIT),
    roundCount: z.number().int().min(1).max(BLOCK_MAX_ROUND_COUNT),
    restBetweenRoundsSeconds: durationSecondsSchema.nullable(),
  })
  .strict();

// Libre : aucun paramètre d'ensemble. Ce n'est pas un manque — c'est le cas où rien ne vaut pour
// toutes les lignes, et où le bandeau n'a donc rien à montrer.
export const freeStructureSchema = z.object({ type: z.literal(BlockType.FREE) }).strict();

export const blockStructureSchema = z.discriminatedUnion("type", [
  seriesStructureSchema,
  emomStructureSchema,
  amrapStructureSchema,
  circuitStructureSchema,
  freeStructureSchema,
]);
export type BlockStructure = z.infer<typeof blockStructureSchema>;

/** Nombre de tops d'un EMOM — dérivé, jamais stocké. */
export function emomTopCount(structure: z.infer<typeof emomStructureSchema>): number {
  return Math.floor(structure.totalDurationSeconds / structure.intervalSeconds);
}

// ── Les colonnes ────────────────────────────────────────────────────────────────────────────

/**
 * Une colonne du bloc. Elle référence soit le catalogue livré, soit une métrique du coach.
 *
 * `label` remplace l'en-tête par défaut quand le coach le renseigne — un circuit d'escalade
 * appelle ses étapes « Voie », pas « Étape ».
 *
 * `collapsed` est un état d'AFFICHAGE : la colonne dont toutes les valeurs sont identiques se
 * montre dans le bandeau au lieu d'une colonne. Les valeurs restent dans les lignes, ce qui rend
 * l'opération réversible sans perte — cf. `canCollapseMetric`.
 */
const blockMetricBaseSchema = {
  id: z.string().min(1),
  label: z.string().min(1).max(BLOCK_LABEL_MAX_LENGTH).nullable(),
  collapsed: z.boolean(),
};

export const MetricSource = {
  CATALOG: "CATALOG",
  CUSTOM: "CUSTOM",
} as const;
export type MetricSource = TypesValuesOf<typeof MetricSource>;

export const catalogBlockMetricSchema = z
  .object({
    ...blockMetricBaseSchema,
    source: z.literal(MetricSource.CATALOG),
    key: metricKeySchema,
    unit: metricUnitSchema,
  })
  .strict()
  .refine((metric) => metricAcceptsUnit(metric.key, metric.unit), {
    message: "Cette unité n'est pas admise par la métrique.",
    path: ["unit"],
  });

export const customBlockMetricSchema = z
  .object({
    ...blockMetricBaseSchema,
    source: z.literal(MetricSource.CUSTOM),
    customMetricId: z.string().min(1),
  })
  .strict();

export const blockMetricSchema = z.discriminatedUnion("source", [
  catalogBlockMetricSchema,
  customBlockMetricSchema,
]);
export type BlockMetric = z.infer<typeof blockMetricSchema>;

// ── Les lignes ──────────────────────────────────────────────────────────────────────────────

/**
 * Une ligne de la grille. Les valeurs sont indexées par l'`id` de la colonne, jamais par sa
 * position : réordonner les colonnes ne doit pas redistribuer les valeurs.
 */
export const blockRowSchema = z
  .object({
    id: z.string().min(1),
    values: z.record(z.string(), metricValueSchema),
  })
  .strict();
export type BlockRow = z.infer<typeof blockRowSchema>;

// ── Le bloc ─────────────────────────────────────────────────────────────────────────────────

/**
 * `rows` peut être VIDE : le coach qui vient d'ajouter un bloc a ses colonnes et pas encore ses
 * valeurs, et cet état s'enregistre (cf. les états vides du constructeur).
 */
export const exerciseBlockSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(BLOCK_LABEL_MAX_LENGTH).nullable(),
    structure: blockStructureSchema,
    metrics: z.array(blockMetricSchema).min(1).max(BLOCK_MAX_METRICS),
    rows: z.array(blockRowSchema).max(BLOCK_MAX_ROWS),
  })
  .strict()
  .refine((block) => new Set(block.metrics.map((m) => m.id)).size === block.metrics.length, {
    message: "Deux colonnes ne peuvent pas partager le même identifiant.",
    path: ["metrics"],
  })
  .refine((block) => new Set(block.rows.map((r) => r.id)).size === block.rows.length, {
    message: "Deux lignes ne peuvent pas partager le même identifiant.",
    path: ["rows"],
  });
export type ExerciseBlock = z.infer<typeof exerciseBlockSchema>;

/**
 * Les métriques MAISON citées par des blocs. Sert au snapshot de diffusion : sans la définition,
 * l'athlète ne verrait qu'un identifiant — ni libellé, ni type de valeur, ni paliers d'échelle.
 */
export function customMetricIdsIn(blocks: ExerciseBlocks): string[] {
  const ids = blocks.flatMap((block) =>
    block.metrics.flatMap((metric) =>
      metric.source === MetricSource.CUSTOM ? [metric.customMetricId] : [],
    ),
  );
  return [...new Set(ids)];
}

// ── Le suivi d'exécution ────────────────────────────────────────────────────────────────────

/**
 * Ce que l'athlète coche, nommé par type de structure.
 *
 * La granularité du suivi n'est PAS celle du coach : un bloc écrit « ×4 séries » n'a qu'une ligne
 * de grille, mais quatre cases. Confondre les deux ferait cocher une fois un effort répété quatre
 * fois.
 */
export const TrackingUnit = {
  SET: "SET",
  TOP: "TOP",
  ROUND: "ROUND",
  STEP: "STEP",
} as const;
export type TrackingUnit = TypesValuesOf<typeof TrackingUnit>;
export const trackingUnitSchema = z.enum(TrackingUnit);

export const TrackingMode = {
  /** Des cases : on coche ce qu'on a fait. */
  CHECK: "CHECK",
  /** Un nombre : l'AMRAP se COMPTE, son objectif n'étant qu'indicatif. */
  COUNT: "COUNT",
} as const;
export type TrackingMode = TypesValuesOf<typeof TrackingMode>;

export type BlockTracking =
  | { mode: typeof TrackingMode.CHECK; unit: TrackingUnit; count: number }
  | { mode: typeof TrackingMode.COUNT; unit: TrackingUnit };

/**
 * Les unités cochables d'un bloc, ou `null` s'il n'y a rien à suivre.
 *
 * Le décompte vient du BANDEAU et non de la grille : « ×4 séries » est le nombre de fois qu'on
 * fait l'effort, que la grille détaille chaque série ou n'en donne qu'une commune. Un bloc LIBRE
 * fait exception — il n'a pas de bandeau, et ses lignes SONT ses étapes.
 */
export function trackingUnits(block: ExerciseBlock): BlockTracking | null {
  const structure = block.structure;

  if (structure.type === BlockType.AMRAP) {
    return { mode: TrackingMode.COUNT, unit: TrackingUnit.ROUND };
  }

  const count = checkableCount(block);
  // Zéro unité : rien à cocher, et une case « 0 sur 0 » ne dirait rien.
  return count === 0 ? null : { mode: TrackingMode.CHECK, unit: unitOf(structure.type), count };
}

function checkableCount(block: ExerciseBlock): number {
  const structure = block.structure;
  if (structure.type === BlockType.SERIES) return structure.setCount;
  if (structure.type === BlockType.EMOM) return emomTopCount(structure);
  if (structure.type === BlockType.CIRCUIT) return structure.roundCount;
  // LIBRE : pas de bandeau, donc pas de répétition d'ensemble — chaque ligne est une étape.
  return block.rows.length;
}

function unitOf(type: BlockType): TrackingUnit {
  if (type === BlockType.EMOM) return TrackingUnit.TOP;
  if (type === BlockType.CIRCUIT) return TrackingUnit.ROUND;
  if (type === BlockType.FREE) return TrackingUnit.STEP;
  return TrackingUnit.SET;
}

/**
 * La LIGNE de dosage qui accompagne l'unité `index`.
 *
 * Une grille qui détaille chaque série en donne une par unité ; une grille à ligne commune la
 * répète. Un décalage — quatre séries, deux lignes — se replie sur la première : l'athlète voit
 * un dosage plausible plutôt qu'une case vide, et le décalage reste l'affaire du coach.
 */
export function rowForUnit(block: ExerciseBlock, index: number): BlockRow | null {
  return block.rows[index] ?? block.rows[0] ?? null;
}

// ── L'état du suivi ─────────────────────────────────────────────────────────────────────────

/** Ce qui a été coché dans un bloc, ou compté pour un AMRAP. */
export const blockTrackingStateSchema = z.union([
  z.object({ checked: z.array(z.number().int().nonnegative()) }).strict(),
  z.object({ rounds: z.number().int().nonnegative() }).strict(),
]);
export type BlockTrackingState = z.infer<typeof blockTrackingStateSchema>;

/**
 * Le suivi d'un exercice, indexé par identifiant de bloc.
 *
 * `null` en base signifie **NON SUIVI**, ce qui n'est pas « zéro coché » : l'athlète n'a rien dit,
 * et on ne lui reproche rien. Un objet vide, lui, dit qu'il a ouvert le suivi sans rien cocher.
 */
export const exerciseTrackingSchema = z.record(z.string(), blockTrackingStateSchema);
export type ExerciseTracking = z.infer<typeof exerciseTrackingSchema>;

export const TrackingState = {
  DONE: "DONE",
  PARTIAL: "PARTIAL",
  UNTRACKED: "UNTRACKED",
} as const;
export type TrackingState = TypesValuesOf<typeof TrackingState>;

export type TrackingSummary = {
  state: TrackingState;
  done: number;
  total: number;
  unit: TrackingUnit | null;
};

/**
 * Ce qu'un exercice affiche : *tout terminé* · *X sur Y* · *non suivi*.
 *
 * Le troisième est SILENCIEUX — jamais « 0 sur 4 », jamais de rouge, jamais de relance. Ne rien
 * cocher n'est pas ne rien faire, et l'app n'a pas à en décider.
 */
export function trackingSummary(
  blocks: ExerciseBlocks,
  tracking: ExerciseTracking | null,
): TrackingSummary {
  const units = blocks.map((block) => ({ block, units: trackingUnits(block) }));
  const total = units.reduce(
    (sum, entry) => sum + (entry.units?.mode === TrackingMode.CHECK ? entry.units.count : 0),
    0,
  );
  const unit = units.find((entry) => entry.units != null)?.units?.unit ?? null;

  if (tracking == null) return { state: TrackingState.UNTRACKED, done: 0, total, unit };

  const done = units.reduce((sum, entry) => {
    const state = tracking[entry.block.id];
    if (state == null || !("checked" in state)) return sum;
    // Bornés au nombre d'unités : un bandeau réduit après coup ne doit pas produire « 5 sur 4 ».
    const max = entry.units?.mode === TrackingMode.CHECK ? entry.units.count : 0;
    return sum + state.checked.filter((index) => index < max).length;
  }, 0);

  const state = total > 0 && done >= total ? TrackingState.DONE : TrackingState.PARTIAL;
  return { state, done, total, unit };
}

// ── Le seuil de colonnes du rendu athlète ───────────────────────────────────────────────────

/**
 * La forme sous laquelle un bloc se lit sur un écran étroit.
 *
 * Les chiffres viennent de la planche mobile : un écran de 402 px moins ses marges laisse 362 px
 * utiles, une colonne de valeur en chasse fixe demande 90 px, et l'index en prend 28. Trois
 * colonnes tiennent, quatre non — et le remède ne peut pas être un défilement horizontal, qui est
 * inutilisable une main sur la barre.
 *
 * Le WEB n'appelle pas cette fonction : il garde le tableau aligné quel que soit le nombre de
 * colonnes, où quatre se lisent sans peine. Le seuil est une spécificité mobile, et la décision
 * vit ici pour que les deux surfaces sachent qu'elle est délibérée.
 */
export const ATHLETE_USABLE_WIDTH_PX = 362;
export const ATHLETE_VALUE_COLUMN_PX = 90;
export const ATHLETE_INDEX_COLUMN_PX = 28;

export const DosageLayout = {
  /** Une seule ligne : elle se dit, quel que soit le nombre de colonnes. */
  PHRASE: "PHRASE",
  /** Les valeurs s'alignent en colonnes — jusqu'à ce que la largeur ne suive plus. */
  TABLE: "TABLE",
  /** Une carte par ligne : c'est la seule forme qui ne demande jamais de défiler. */
  CARDS: "CARDS",
} as const;
export type DosageLayout = TypesValuesOf<typeof DosageLayout>;

/** Le nombre de colonnes qu'un écran étroit peut aligner, index compris. */
export function fittingColumnCount(
  usableWidth = ATHLETE_USABLE_WIDTH_PX,
  columnWidth = ATHLETE_VALUE_COLUMN_PX,
  indexWidth = ATHLETE_INDEX_COLUMN_PX,
): number {
  return Math.max(0, Math.floor((usableWidth - indexWidth) / columnWidth));
}

/**
 * La forme à donner à un bloc côté athlète mobile.
 *
 * Les colonnes REPLIÉES ne comptent pas : elles ont quitté la grille pour rejoindre la phrase de
 * dosage, et les compter ferait basculer en cartes un tableau qui tient largement.
 */
export function dosageLayout(block: ExerciseBlock, usableWidth?: number): DosageLayout {
  if (block.rows.length <= 1) return DosageLayout.PHRASE;
  const columns = block.metrics.filter((metric) => !metric.collapsed).length;
  return columns <= fittingColumnCount(usableWidth) ? DosageLayout.TABLE : DosageLayout.CARDS;
}

// ── Lignes incomplètes ──────────────────────────────────────────────────────────────────────

/**
 * Les positions (0-based) des lignes qui ne portent AUCUNE valeur.
 *
 * Ce n'est pas une erreur de schéma — `blockRowSchema` accepte `values: {}` — et ça ne doit pas
 * l'être : une ligne se crée vide, et le coach la remplit ensuite. Mais une ligne restée vide à
 * l'enregistrement ne dit rien à l'athlète, qui verrait « — » sur toute la ligne. D'où un
 * AVERTISSEMENT, jamais un blocage : c'est au coach de choisir entre la remplir et la retirer.
 */
export function emptyRowIndexes(block: ExerciseBlock): number[] {
  return block.rows.flatMap((row, index) => {
    const hasValue = block.metrics.some((metric) => (row.values[metric.id] ?? null) !== null);
    return hasValue ? [] : [index];
  });
}

// ── La phrase de dosage ─────────────────────────────────────────────────────────────────────

/**
 * Une phrase à rendre : la clé i18n et ses paramètres. Le TEXTE reste dans les catalogues des
 * apps, la logique reste ici.
 *
 * Pourquoi pas la phrase toute faite : `@cmv/shared` ne connaît pas i18next, et le mobile rend
 * les mêmes blocs avec ses propres composants. Rendre la phrase ici obligerait à y importer une
 * bibliothèque de traduction, ou à recopier la logique des deux côtés — c'est exactement la
 * divergence qu'on veut éviter entre les surfaces.
 */
export type DosagePhrase = {
  key: string;
  params: Readonly<Record<string, string | number>>;
};

/**
 * Ce que le bandeau dit à l'athlète : « 4 séries », « Toutes les minutes pendant 10 min »…
 *
 * `null` pour un bloc LIBRE : il n'a aucun paramètre d'ensemble, et inventer une phrase reviendrait
 * à annoncer une consigne que le coach n'a pas écrite.
 */
export function structurePhrase(structure: BlockStructure): DosagePhrase | null {
  if (structure.type === BlockType.SERIES) {
    return { key: "exercise.dosage.series", params: { count: structure.setCount } };
  }
  if (structure.type === BlockType.EMOM) {
    return {
      key: "exercise.dosage.emom",
      params: {
        interval: formatTrainingDuration(structure.intervalSeconds) ?? "",
        total: formatTrainingDuration(structure.totalDurationSeconds) ?? "",
      },
    };
  }
  if (structure.type === BlockType.AMRAP) {
    const total = formatTrainingDuration(structure.totalDurationSeconds) ?? "";
    // L'objectif est INDICATIF : sans lui la phrase se tient toujours, elle ne promet simplement
    // plus de cible.
    return structure.targetRounds == null
      ? { key: "exercise.dosage.amrap", params: { total } }
      : {
          key: "exercise.dosage.amrapWithTarget",
          params: { total, count: structure.targetRounds },
        };
  }
  if (structure.type === BlockType.CIRCUIT) {
    return { key: "exercise.dosage.circuit", params: { count: structure.roundCount } };
  }
  return null;
}

/**
 * Le repos du bandeau, phrase à part : il se lit après le reste (« …, 2'30 de repos entre les
 * séries ») et reste `null` quand le coach n'en a pas posé — un repos inventé serait une consigne
 * de plus (règle nullable n°5).
 */
export function restPhrase(structure: BlockStructure): DosagePhrase | null {
  if (structure.type === BlockType.SERIES && structure.restBetweenSetsSeconds != null) {
    return {
      key: "exercise.dosage.restBetweenSets",
      params: { rest: formatTrainingDuration(structure.restBetweenSetsSeconds) ?? "" },
    };
  }
  if (structure.type === BlockType.CIRCUIT && structure.restBetweenRoundsSeconds != null) {
    return {
      key: "exercise.dosage.restBetweenRounds",
      params: { rest: formatTrainingDuration(structure.restBetweenRoundsSeconds) ?? "" },
    };
  }
  return null;
}

// ── Remplissage d'une colonne ───────────────────────────────────────────────────────────────

/**
 * Les quatre façons de remplir une colonne d'un coup. Elles existent parce que la saisie
 * cellule par cellule est le vrai coût du dosage : « 6 · 6 · 6 · 6 », « 8 · 10 · 12 · 14 » et
 * « 5a · 5b · 6a · 6b » sont trois gestes que le coach refait à chaque exercice.
 *
 * `MIRROR` n'est pas réservé au raccourci Pyramide : c'est une opération de colonne comme les
 * autres, et le bloc ne garde aucune trace du raccourci dont il est issu.
 */
export const ColumnFillMode = {
  SAME: "SAME",
  STEP: "STEP",
  SCALE_STEP: "SCALE_STEP",
  MIRROR: "MIRROR",
} as const;
export type ColumnFillMode = TypesValuesOf<typeof ColumnFillMode>;

export type ColumnFillPlan =
  | { mode: typeof ColumnFillMode.SAME; value: MetricValue }
  | { mode: typeof ColumnFillMode.STEP; start: number; step: number }
  | { mode: typeof ColumnFillMode.SCALE_STEP; scale: OrderedScale; start: string; step: number }
  | { mode: typeof ColumnFillMode.MIRROR };

function fillSame(count: number, value: MetricValue): MetricValue[] {
  return Array.from({ length: count }, () => value);
}

function fillStep(count: number, start: number, step: number): MetricValue[] {
  return Array.from({ length: count }, (_, index) => start + index * step);
}

/**
 * Progression sur une échelle ORDONNÉE. Elle BUTE sur le dernier palier au lieu de boucler :
 * repasser à « 5a » après « 9c » produirait une consigne absurde que rien ne signalerait.
 */
function fillScaleStep(
  count: number,
  scale: OrderedScale,
  start: string,
  step: number,
): MetricValue[] {
  const from = scaleStepIndex(scale, start);
  if (from == null) return fillSame(count, null);
  return Array.from({ length: count }, (_, index) => {
    const position = Math.min(Math.max(from + index * step, 0), scale.length - 1);
    return scale[position] ?? null;
  });
}

/**
 * Miroir : la première moitié saisie, la seconde qui la reflète. Sur un nombre IMPAIR de lignes,
 * le palier du milieu n'est pas dupliqué — c'est le sommet de la pyramide.
 */
function fillMirror(values: readonly MetricValue[]): MetricValue[] {
  const count = values.length;
  const half = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, index) =>
    index < half ? (values[index] ?? null) : (values[count - 1 - index] ?? null),
  );
}

function plannedValues(current: readonly MetricValue[], plan: ColumnFillPlan): MetricValue[] {
  const count = current.length;
  if (plan.mode === ColumnFillMode.SAME) return fillSame(count, plan.value);
  if (plan.mode === ColumnFillMode.STEP) return fillStep(count, plan.start, plan.step);
  if (plan.mode === ColumnFillMode.SCALE_STEP) {
    return fillScaleStep(count, plan.scale, plan.start, plan.step);
  }
  return fillMirror(current);
}

/**
 * Les lignes du bloc, une colonne réécrite. Les AUTRES colonnes ne bougent pas : remplir « Charge »
 * ne doit rien faire aux répétitions déjà saisies.
 */
export function fillColumn(
  block: ExerciseBlock,
  metricId: string,
  plan: ColumnFillPlan,
): ExerciseBlock["rows"] {
  const next = plannedValues(columnValues(block, metricId), plan);
  return block.rows.map((row, index) => ({
    ...row,
    values: { ...row.values, [metricId]: next[index] ?? null },
  }));
}

// ── Valeurs de départ ───────────────────────────────────────────────────────────────────────

/**
 * Le bandeau d'un bloc qu'on vient d'ajouter. Des valeurs PLAUSIBLES plutôt que des champs vides :
 * un bandeau vide obligerait le coach à tout saisir avant de voir quoi que ce soit, alors que
 * « 4 séries » ou « toutes les minutes pendant 10 min » sont ce qu'il écrit neuf fois sur dix.
 *
 * Le repos est `null` : contrairement au reste, il n'a pas de valeur évidente, et l'inventer
 * ferait passer une supposition pour une consigne (règle nullable n°5).
 */
export const DEFAULT_BLOCK_STRUCTURE = {
  [BlockType.SERIES]: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
  [BlockType.EMOM]: { type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 600 },
  [BlockType.AMRAP]: { type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: null },
  [BlockType.CIRCUIT]: { type: BlockType.CIRCUIT, roundCount: 4, restBetweenRoundsSeconds: null },
  [BlockType.FREE]: { type: BlockType.FREE },
} as const satisfies Record<BlockType, BlockStructure>;

/**
 * Les colonnes d'un bloc qu'on vient d'ajouter. `exerciseBlockSchema` en exige au moins une : un
 * bloc sans colonne ne pourrait rien porter, et le coach n'aurait aucune grille où écrire.
 *
 * Circuit et Libre partent d'un LIBELLÉ parce que leurs lignes sont des étapes nommées — « Voie 1 »,
 * « Mobilité épaules » — là où les autres types répètent le MÊME effort et n'ont rien à nommer.
 */
export const DEFAULT_BLOCK_METRIC_KEYS = {
  [BlockType.SERIES]: [MetricKey.REPETITIONS],
  [BlockType.EMOM]: [MetricKey.REPETITIONS],
  [BlockType.AMRAP]: [MetricKey.REPETITIONS],
  [BlockType.CIRCUIT]: [MetricKey.LABEL],
  [BlockType.FREE]: [MetricKey.LABEL],
} as const satisfies Record<BlockType, readonly MetricKey[]>;

export const exerciseBlocksSchema = z
  .array(exerciseBlockSchema)
  .max(EXERCISE_MAX_BLOCKS)
  // Les identifiants sont uniques DANS un bloc (colonnes, lignes) mais rien ne garantissait qu'ils
  // le soient ENTRE blocs : deux blocs de même id cassent le réordonnancement et le snapshot de
  // planification, qui s'y adressent par id.
  .refine((blocks) => new Set(blocks.map((block) => block.id)).size === blocks.length, {
    message: "Deux blocs ne peuvent pas partager le même identifiant.",
  });
export type ExerciseBlocks = z.infer<typeof exerciseBlocksSchema>;

// ── Invariants qui dépendent du contenu ─────────────────────────────────────────────────────

/** Le type de valeur d'une colonne — catalogue ou métrique du coach. */
export function metricValueTypeOf(
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[] = [],
): MetricValueType | null {
  if (metric.source === MetricSource.CATALOG) return METRIC_CATALOG[metric.key].valueType;
  return customMetrics.find((c) => c.id === metric.customMetricId)?.valueType ?? null;
}

/** Les valeurs d'une colonne, ligne à ligne. */
export function columnValues(block: ExerciseBlock, metricId: string): MetricValue[] {
  return block.rows.map((row) => row.values[metricId] ?? null);
}

/**
 * Une colonne ne se replie que si toutes ses valeurs sont identiques — sinon le bandeau
 * afficherait une valeur commune qui n'en est pas une, et le dépliage inventerait des données.
 * Une grille sans ligne se replie librement : il n'y a rien à contredire.
 */
export function canCollapseMetric(block: ExerciseBlock, metricId: string): boolean {
  const values = columnValues(block, metricId);
  if (values.length === 0) return true;
  const [first, ...rest] = values;
  return rest.every((value) => value === first);
}

export type BlockValidationIssue = {
  readonly rowId: string;
  readonly metricId: string;
  readonly message: string;
};

// `rowId` vide : l'anomalie porte sur la colonne entière, pas sur une cellule.
const COLUMN_WIDE = "";

function scaleOf(metric: BlockMetric, customMetrics: readonly CustomMetric[]): OrderedScale | null {
  if (metric.source === MetricSource.CATALOG) return null;
  return customMetrics.find((custom) => custom.id === metric.customMetricId)?.scale ?? null;
}

function cellIssues(
  block: ExerciseBlock,
  metric: BlockMetric,
  valueSchema: z.ZodType<MetricValue>,
): BlockValidationIssue[] {
  return block.rows.flatMap((row) => {
    const parsed = valueSchema.safeParse(row.values[metric.id] ?? null);
    if (parsed.success) return [];
    return [
      {
        rowId: row.id,
        metricId: metric.id,
        message: parsed.error.issues[0]?.message ?? "Valeur invalide pour cette colonne.",
      },
    ];
  });
}

function columnIssues(
  block: ExerciseBlock,
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[],
): BlockValidationIssue[] {
  const valueType = metricValueTypeOf(metric, customMetrics);
  if (valueType === null) {
    return [
      {
        rowId: COLUMN_WIDE,
        metricId: metric.id,
        message: "Cette colonne référence une métrique introuvable.",
      },
    ];
  }

  const valueSchema = metricValueSchemaFor(valueType, scaleOf(metric, customMetrics));
  const collapseIssue =
    metric.collapsed && !canCollapseMetric(block, metric.id)
      ? [
          {
            rowId: COLUMN_WIDE,
            metricId: metric.id,
            message: "Une colonne aux valeurs différentes ne peut pas être repliée.",
          },
        ]
      : [];

  return [...cellIssues(block, metric, valueSchema), ...collapseIssue];
}

// Une valeur dont la colonne n'existe plus — colonne retirée sans nettoyer les lignes.
function orphanValueIssues(block: ExerciseBlock): BlockValidationIssue[] {
  const known = new Set(block.metrics.map((metric) => metric.id));
  return block.rows.flatMap((row) =>
    Object.keys(row.values)
      .filter((metricId) => !known.has(metricId))
      .map((metricId) => ({
        rowId: row.id,
        metricId,
        message: "Cette ligne porte une valeur pour une colonne inexistante.",
      })),
  );
}

/**
 * Croise chaque cellule avec le type de sa colonne. Ce contrôle ne peut pas vivre dans le schéma
 * Zod du bloc : le type d'une colonne personnalisée n'est connu qu'avec les métriques du coach,
 * qui vivent à côté de l'exercice.
 *
 * Rend une liste d'anomalies LOCALISÉES plutôt qu'un booléen — l'éditeur doit pouvoir surligner
 * la bonne cellule.
 */
export function validateBlockValues(
  block: ExerciseBlock,
  customMetrics: readonly CustomMetric[] = [],
): BlockValidationIssue[] {
  return [
    ...block.metrics.flatMap((metric) => columnIssues(block, metric, customMetrics)),
    ...orphanValueIssues(block),
  ];
}
