import { z } from "zod";
import { required } from "../util/invariant.util";
import { clientKeySchema } from "./client-key.schema";
import {
  type CustomMetric,
  type MetricValue,
  metricValueEntrySchema,
  metricValueSchema,
  metricValueSchemaFor,
} from "./exercise-metric.schema";
import {
  catalogMetricShape,
  customMetricShape,
  GRID_MAX_METRICS,
  type MetricReference,
  MetricSource,
  metricUnitRefinement,
  metricValueTypeOf,
  scaleFor,
} from "./metric-reference.schema";
import { STRUCTURE_MAX_ROUNDS } from "./structure.schema";
import type { SuggestedMetric } from "./suggested-metric.schema";

// La grille d'un exercice de bloc (#715) : ses colonnes et ses lignes de valeurs.

export const GRID_LABEL_MAX_LENGTH = 60;
/** Une ligne par tour, série ou passage : autant que de tours au plus. */
export const GRID_MAX_ROWS = STRUCTURE_MAX_ROUNDS;

type GridRefinement<T> = [(grid: T) => boolean, { message: string; path: string[] }];
const distinctIds = (items: readonly { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

/** Deux colonnes ne partagent pas un identifiant : les valeurs d'une ligne s'y rangent. */
const distinctColumnIds: GridRefinement<{ metrics: readonly { id: string }[] }> = [
  (grid) => distinctIds(grid.metrics),
  { message: "Deux colonnes ne peuvent pas partager le même identifiant.", path: ["metrics"] },
];

const distinctRowIds: GridRefinement<{ rows: readonly { id: string }[] }> = [
  (grid) => distinctIds(grid.rows),
  { message: "Deux lignes ne peuvent pas partager le même identifiant.", path: ["rows"] },
];

// ── La grille ───────────────────────────────────────────────────────────────────────────────

/**
 * La grille, à l'identifiant de colonne et de ligne près. L'ENTRÉE le borne (`clientKeySchema`,
 * #354) ; la RELECTURE non, pour qu'une grille stockée avant la borne ne fasse pas échouer en 500 la
 * lecture de toute la séance (#297).
 *
 * Toutes les valeurs sont facultatives : une cellule vide se lit « — », et la séance s'enregistre
 * quand même. Une grille sans colonne est permise — une routine de mobilité n'a rien à mesurer.
 *
 * La longueur d'un texte suit la même règle que les identifiants (#323). Le type d'une cellule se
 * vérifie à part (`gridValueIssues`), mais pas celui d'une colonne maison orpheline (dette EX-2) :
 * sa longueur n'est tenue qu'ici.
 */
function gridSchemasOf(id: z.ZodString, value: z.ZodType<MetricValue>) {
  /** `label` remplace l'en-tête par défaut quand le Coach le renseigne (« Voie » plutôt que « Libellé »). */
  const metricBase = {
    id,
    label: z.string().trim().min(1).max(GRID_LABEL_MAX_LENGTH).nullable(),
  };
  const metric = z.discriminatedUnion("source", [
    z
      .object({ ...metricBase, ...catalogMetricShape })
      .strict()
      .refine(...metricUnitRefinement),
    z.object({ ...metricBase, ...customMetricShape }).strict(),
  ]);
  /** Les valeurs sont indexées par l'`id` de la colonne : réordonner les colonnes ne les déplace pas. */
  const row = z.object({ id, values: z.record(z.string(), value) }).strict();
  const grid = z
    .object({
      metrics: z.array(metric).max(GRID_MAX_METRICS),
      rows: z.array(row).max(GRID_MAX_ROWS),
    })
    .strict()
    .refine(...distinctColumnIds)
    .refine(...distinctRowIds)
    .superRefine((value, context) => {
      // Chaque valeur orpheline est refusée À SA CELLULE, pour que l'éditeur la montre.
      const known = new Set(value.metrics.map((column) => column.id));
      value.rows.forEach((line, index) => {
        for (const metricId of Object.keys(line.values)) {
          if (known.has(metricId)) continue;
          context.addIssue({
            code: "custom",
            path: ["rows", index, "values", metricId],
            message: "Une ligne porte une valeur pour une colonne inexistante.",
          });
        }
      });
    });
  return { metric, row, grid };
}

const entryGrid = gridSchemasOf(clientKeySchema, metricValueEntrySchema);

export const gridMetricSchema = entryGrid.metric;
export type GridMetric = z.infer<typeof gridMetricSchema>;
export const gridRowSchema = entryGrid.row;
export type GridRow = z.infer<typeof gridRowSchema>;
export const blockGridSchema = entryGrid.grid;
export type BlockGrid = z.infer<typeof blockGridSchema>;

/** La grille relue depuis la base : la même, sans borne sur ses identifiants ni sur ses textes. */
export const storedBlockGridSchema = gridSchemasOf(z.string().min(1), metricValueSchema).grid;

/**
 * La même colonne : même identifiant, même libellé, même mesure. Changer l'UNITÉ change ce que
 * l'athlète comprend — « 6 » en kilos et « 6 » en pourcentage du poids de corps ne sont pas le même
 * effort.
 */
export function sameGridMetric(base: GridMetric, next: GridMetric): boolean {
  if (base.id !== next.id || base.label !== next.label) return false;
  // Changer de source, c'est changer de mesure : chaque branche exige la même des deux côtés.
  if (base.source === MetricSource.CATALOG) {
    return next.source === MetricSource.CATALOG && base.key === next.key && base.unit === next.unit;
  }
  return next.source === MetricSource.CUSTOM && base.customMetricId === next.customMetricId;
}

/** Mêmes colonnes, dans le même ordre : réordonner change ce que l'athlète lit. */
export function sameGridMetrics(base: readonly GridMetric[], next: readonly GridMetric[]): boolean {
  return (
    base.length === next.length &&
    base.every((metric, index) => {
      const counterpart = next[index];
      return counterpart != null && sameGridMetric(metric, counterpart);
    })
  );
}

/**
 * Les colonnes d'un exercice qu'on ajoute à un bloc : ses métriques suggérées, dans l'ordre.
 * `newId(index)` fournit l'identifiant de chaque colonne.
 */
export function metricsFromSuggested(
  suggested: readonly SuggestedMetric[],
  newId: (index: number) => string,
): GridMetric[] {
  return suggested.map((metric, index) => ({ ...metric, id: newId(index), label: null }));
}

// ── Invariants qui dépendent du contenu ─────────────────────────────────────────────────────

export type GridValueIssue = {
  readonly rowId: string;
  readonly metricId: string;
  readonly message: string;
};

// `rowId` vide : l'anomalie porte sur la colonne entière, pas sur une cellule.
const COLUMN_WIDE = "";

type ValuedColumn = MetricReference & { readonly id: string };
type ValuedRows = { readonly rows: readonly { id: string; values: Record<string, MetricValue> }[] };

function cellIssues(
  grid: ValuedRows,
  metric: ValuedColumn,
  valueSchema: z.ZodType<MetricValue>,
): GridValueIssue[] {
  return grid.rows.flatMap((row) => {
    const parsed = valueSchema.safeParse(row.values[metric.id] ?? null);
    if (parsed.success) return [];
    return [
      {
        rowId: row.id,
        metricId: metric.id,
        // Un échec de Zod porte toujours au moins une issue.
        message: required(parsed.error.issues[0], "échec de validation sans issue").message,
      },
    ];
  });
}

/** Le schéma des cellules d'une colonne, ou `null` quand sa métrique est introuvable. */
function valueSchemaOf(
  metric: ValuedColumn,
  customMetrics: readonly CustomMetric[],
): z.ZodType<MetricValue> | null {
  const valueType = metricValueTypeOf(metric, customMetrics);
  return valueType === null
    ? null
    : metricValueSchemaFor(valueType, scaleFor(metric, customMetrics));
}

function unknownColumn(metric: ValuedColumn): GridValueIssue {
  return {
    rowId: COLUMN_WIDE,
    metricId: metric.id,
    message: "Cette colonne référence une métrique introuvable.",
  };
}

/**
 * Croise chaque cellule de la grille d'un exercice de bloc (#716) avec le type de sa colonne. Ce
 * contrôle ne peut pas vivre dans le schéma Zod : le type d'une colonne maison n'est connu qu'avec
 * les métriques du Coach, que seul le serveur charge — il le fait avant d'écrire. Rend des anomalies
 * LOCALISÉES, pour que l'éditeur surligne la bonne cellule. La grille n'a pas de valeur orpheline
 * à signaler : son schéma les refuse déjà (#715).
 */
export function gridValueIssues(
  grid: ValuedRows & { readonly metrics: readonly ValuedColumn[] },
  customMetrics: readonly CustomMetric[],
): GridValueIssue[] {
  return grid.metrics.flatMap((metric) => {
    const valueSchema = valueSchemaOf(metric, customMetrics);
    return valueSchema === null ? [unknownColumn(metric)] : cellIssues(grid, metric, valueSchema);
  });
}
