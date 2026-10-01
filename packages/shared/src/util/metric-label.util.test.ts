import { describe, expect, it } from "vitest";
import {
  type BlockMetric,
  BlockType,
  exerciseBlockSchema,
  MetricSource,
} from "../dto/exercise-block.schema";
import {
  type CustomMetric,
  METRIC_LABEL_KEY,
  METRIC_UNIT_LABEL_KEY,
  MetricKey,
  MetricUnit,
  MetricValueType,
} from "../dto/exercise-metric.schema";
import {
  formatMetricValue,
  metricCellText,
  metricLabel,
  metricUnitLabel,
  unitDetail,
} from "./metric-label.util";

/**
 * Le traducteur des tests rend la CLÉ, jamais le français : un test écrit sur le texte du
 * catalogue casserait au premier reformulage, un rouge sans qu'aucune régression n'ait eu lieu.
 */
const fakeT = (key: string) => key;

const catalogMetric = (over: Partial<Extract<BlockMetric, { source: "CATALOG" }>> = {}) =>
  ({
    id: "col-1",
    source: MetricSource.CATALOG,
    key: MetricKey.REPETITIONS,
    unit: MetricUnit.REPS,
    label: null,
    collapsed: false,
    ...over,
  }) satisfies BlockMetric;

const customMetric = (over: Partial<Extract<BlockMetric, { source: "CUSTOM" }>> = {}) =>
  ({
    id: "col-2",
    source: MetricSource.CUSTOM,
    customMetricId: "cm-1",
    label: null,
    collapsed: false,
    ...over,
  }) satisfies BlockMetric;

const voie: CustomMetric = {
  id: "cm-1",
  label: "Voie",
  unit: "6b+",
  valueType: MetricValueType.TEXT,
  scale: null,
};

describe("metricLabel", () => {
  it("préfère le libellé écrit sur la colonne à toute autre source", () => {
    expect(metricLabel(catalogMetric({ label: "Voie" }), [voie], fakeT)).toBe("Voie");
  });

  it("rend le nom d'une métrique maison TEL QUEL : c'est la donnée du coach, pas une clé i18n", () => {
    expect(metricLabel(customMetric(), [voie], fakeT)).toBe("Voie");
  });

  it("traduit le catalogue livré, lui", () => {
    expect(metricLabel(catalogMetric(), [], fakeT)).toBe(METRIC_LABEL_KEY[MetricKey.REPETITIONS]);
  });

  it("rend le tiret quand la métrique maison citée a disparu, jamais son identifiant", () => {
    expect(metricLabel(customMetric(), [], fakeT)).toBe("—");
  });
});

describe("metricUnitLabel", () => {
  it("rend null sur MetricUnit.NONE : l'absence d'unité n'est pas une unité", () => {
    expect(metricUnitLabel(catalogMetric({ unit: MetricUnit.NONE }), [], fakeT)).toBeNull();
  });

  it("traduit l'unité du catalogue", () => {
    expect(metricUnitLabel(catalogMetric(), [], fakeT)).toBe(
      METRIC_UNIT_LABEL_KEY[MetricUnit.REPS],
    );
  });

  it("rend l'unité maison sans la traduire, et null si la métrique a disparu", () => {
    expect(metricUnitLabel(customMetric(), [voie], fakeT)).toBe("6b+");
    expect(metricUnitLabel(customMetric(), [], fakeT)).toBeNull();
  });
});

describe("formatMetricValue", () => {
  // Règle dure n°5 : une valeur absente est une absence, jamais un zéro.
  it("rend le tiret sur une absence, et non 0", () => {
    expect(formatMetricValue(null, catalogMetric(), [], "fr")).toBe("—");
  });

  it("distingue le zéro SAISI de l'absence", () => {
    expect(formatMetricValue(0, catalogMetric(), [], "fr")).toBe("0");
  });

  it("met une durée en forme au lieu d'afficher des secondes brutes", () => {
    const metric = catalogMetric({ key: MetricKey.REST_BETWEEN_SETS, unit: MetricUnit.NONE });
    expect(formatMetricValue(150, metric, [], "fr")).toBe("2'30");
  });

  it("écrit un nombre dans la langue du lecteur", () => {
    expect(formatMetricValue(12.5, catalogMetric(), [], "fr")).toBe("12,5");
    expect(formatMetricValue(12.5, catalogMetric(), [], "en")).toBe("12.5");
  });

  it("rend un palier ou un texte tel quel", () => {
    expect(formatMetricValue("6b+", customMetric(), [voie], "fr")).toBe("6b+");
  });

  it("rend le texte d'une durée MAISON tel quel : elle n'est pas comptée en secondes", () => {
    const duree: CustomMetric = { ...voie, valueType: MetricValueType.DURATION };
    expect(formatMetricValue("2 min", customMetric(), [duree], "fr")).toBe("2 min");
  });
});

describe("metricCellText", () => {
  it("colle l'unité derrière la valeur", () => {
    expect(metricCellText(6, catalogMetric(), [], fakeT, "fr")).toBe(
      `6 ${METRIC_UNIT_LABEL_KEY[MetricUnit.REPS]}`,
    );
  });

  /**
   * Le cas qui justifie ce module : « — kg » laisse croire à une charge nulle. Le tiret doit rester
   * seul, sinon une absence se lit comme un zéro.
   */
  it("ne met AUCUNE unité derrière une absence", () => {
    expect(metricCellText(null, catalogMetric(), [], fakeT, "fr")).toBe("—");
  });

  /**
   * Le contrat que le mobile violait (#137) : il rendait `""`, qui disparaît sans bruit d'un
   * `join(" · ")` et y laisse un séparateur orphelin. Une absence se DIT.
   */
  it("ne rend jamais la chaîne vide, quelle que soit la colonne", () => {
    expect(metricCellText(null, catalogMetric({ unit: MetricUnit.NONE }), [], fakeT, "fr")).toBe(
      "—",
    );
    expect(metricCellText(null, customMetric(), [], fakeT, "fr")).toBe("—");
  });

  it("écrit la valeur dans la langue du lecteur, unité comprise", () => {
    expect(metricCellText(2.5, catalogMetric(), [], fakeT, "fr")).toBe(
      `2,5 ${METRIC_UNIT_LABEL_KEY[MetricUnit.REPS]}`,
    );
  });

  it("laisse une valeur sans unité se dire seule", () => {
    expect(metricCellText(6, catalogMetric({ unit: MetricUnit.NONE }), [], fakeT, "fr")).toBe("6");
  });
});

describe("unitDetail", () => {
  const reps = catalogMetric({ id: "col_reps" });
  const load = catalogMetric({
    id: "col_load",
    key: MetricKey.LOAD,
    unit: MetricUnit.KILOGRAMS_ADDED,
  });
  const block = (values: Record<string, number | null>) =>
    exerciseBlockSchema.parse({
      id: "blk",
      label: null,
      structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: 90 },
      metrics: [reps, load],
      rows: [{ id: "r1", values }],
    });

  it("rappelle les valeurs de la ligne, dans l'ordre des colonnes, séparées d'un point médian", () => {
    expect(unitDetail(block({ col_load: 12, col_reps: 6 }), 0, [], fakeT, "fr")).toBe(
      `${metricCellText(6, reps, [], fakeT, "fr")} · ${metricCellText(12, load, [], fakeT, "fr")}`,
    );
  });

  it("saute une colonne vide plutôt que d'y écrire un tiret", () => {
    expect(unitDetail(block({ col_reps: 6, col_load: null }), 0, [], fakeT, "fr")).toBe(
      metricCellText(6, reps, [], fakeT, "fr"),
    );
  });

  /** Rien à rappeler : la case s'affiche sans détail. */
  it("rend une chaîne vide sur une ligne sans valeur", () => {
    expect(unitDetail(block({}), 0, [], fakeT, "fr")).toBe("");
  });
});
