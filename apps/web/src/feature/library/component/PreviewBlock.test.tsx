import {
  BlockType,
  type CustomMetric,
  type ExerciseBlock,
  exerciseBlockSchema,
  METRIC_LABEL_KEY,
  METRIC_UNIT_LABEL_KEY,
  MetricKey,
  MetricSource,
  MetricUnit,
  MetricValueType,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { PreviewBlock } from "@/feature/library/component/PreviewBlock";
import { renderWithProviders } from "../../../../test/render";

const column = (id: string, key: MetricKey, unit: MetricUnit, collapsed = false) =>
  ({ id, source: MetricSource.CATALOG, key, unit, label: null, collapsed }) as const;

const reps = column("col_reps", MetricKey.REPETITIONS, MetricUnit.REPS);
const load = column("col_load", MetricKey.LOAD, MetricUnit.KILOGRAMS_ADDED);

const REPS = METRIC_LABEL_KEY[MetricKey.REPETITIONS];
const LOAD = METRIC_LABEL_KEY[MetricKey.LOAD];
const REPS_UNIT = METRIC_UNIT_LABEL_KEY[MetricUnit.REPS];
const LOAD_UNIT = METRIC_UNIT_LABEL_KEY[MetricUnit.KILOGRAMS_ADDED];

const block = (
  rows: ExerciseBlock["rows"],
  metrics: ExerciseBlock["metrics"] = [reps, load],
  label: string | null = null,
): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_1",
    label,
    structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: 150 },
    metrics,
    rows,
  });

describe("PreviewBlock — une seule ligne", () => {
  /** Un tableau à une ligne mettrait un en-tête au-dessus d'une seule valeur. */
  it("se lit en phrase, unités comprises, sans en-tête de colonne", () => {
    const { container } = renderWithProviders(
      <PreviewBlock
        block={block([{ id: "r1", values: { col_reps: 6, col_load: 12 } }])}
        customMetrics={[]}
      />,
    );

    expect(container.textContent).toContain(`6 ${REPS_UNIT} · 12 ${LOAD_UNIT}`);
    expect(container.querySelector("table")).toBeNull();
  });

  /**
   * L'aperçu sert au coach à se relire AVANT de diffuser : le tiret lui dit qu'il lui manque une
   * valeur. C'est le contrat commun aux deux surfaces depuis #137 — le mobile disait la même chose
   * en la taisant, ce qui laissait croire que la colonne n'existait pas.
   */
  it("dit « — » sur une colonne vide, au lieu de la taire", () => {
    const { container } = renderWithProviders(
      <PreviewBlock block={block([{ id: "r1", values: { col_reps: 6 } }])} customMetrics={[]} />,
    );

    expect(container.textContent).toContain(`6 ${REPS_UNIT} · —`);
    expect(container.textContent).not.toContain(`— ${LOAD_UNIT}`);
  });
});

describe("PreviewBlock — plusieurs lignes", () => {
  const rows = [
    { id: "r1", values: { col_reps: 6, col_load: 12 } },
    { id: "r2", values: { col_reps: 8, col_load: 10 } },
  ];

  it("passe au tableau, et coiffe chaque colonne de son libellé", () => {
    const { container, getByRole } = renderWithProviders(
      <PreviewBlock block={block(rows)} customMetrics={[]} />,
    );

    expect(getByRole("table")).toBeTruthy();
    expect(container.textContent).toContain(REPS);
    expect(container.textContent).toContain(LOAD);
  });

  it("met « — » dans la case d'une valeur absente", () => {
    const trouées = [{ id: "r1", values: { col_reps: 6 } }, ...rows.slice(1)];
    const { container } = renderWithProviders(
      <PreviewBlock block={block(trouées)} customMetrics={[]} />,
    );

    expect(container.textContent).toContain("—");
  });
});

describe("PreviewBlock — le bandeau", () => {
  it("annonce le nom du bloc, sa structure et son repos", () => {
    const { container } = renderWithProviders(
      <PreviewBlock
        block={block(
          [{ id: "r1", values: { col_reps: 6, col_load: 12 } }],
          [reps, load],
          "Travail",
        )}
        customMetrics={[]}
      />,
    );

    expect(container.textContent).toContain("Travail");
    expect(container.textContent).toContain("exercise.dosage.series");
    expect(container.textContent).toContain("exercise.dosage.restBetweenSets");
  });

  /** Une colonne repliée porte la même valeur partout : elle se dit dans le bandeau, pas en grille. */
  it("sort la valeur commune d'une colonne repliée du tableau", () => {
    const collapsedLoad = column("col_load", MetricKey.LOAD, MetricUnit.KILOGRAMS_ADDED, true);
    const { getByRole, container } = renderWithProviders(
      <PreviewBlock
        block={block(
          [
            { id: "r1", values: { col_reps: 6, col_load: 12 } },
            { id: "r2", values: { col_reps: 8, col_load: 12 } },
          ],
          [reps, collapsedLoad],
        )}
        customMetrics={[]}
      />,
    );

    expect(container.textContent).toContain(`${LOAD} 12`);
    expect(getByRole("table").textContent).not.toContain(LOAD);
  });
});

describe("PreviewBlock — les états vides", () => {
  /** Une grille sans ligne annonce ce qui viendra, plutôt que de montrer un tableau vide. */
  it("annonce l'absence de ligne au lieu de rendre un tableau vide", () => {
    const { container } = renderWithProviders(
      <PreviewBlock block={block([])} customMetrics={[]} />,
    );

    expect(container.textContent).toContain("library.builder.preview.noRow");
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("PreviewBlock — les métriques maison", () => {
  const voie: CustomMetric = {
    id: "cm_1",
    label: "Voie",
    unit: "6b+",
    valueType: MetricValueType.TEXT,
    scale: null,
  };
  const custom = {
    id: "col_voie",
    source: MetricSource.CUSTOM,
    customMetricId: "cm_1",
    label: null,
    collapsed: false,
  } as const;

  it("rend le nom et l'unité du coach TELS QUELS : c'est sa donnée, pas une clé i18n", () => {
    const { container } = renderWithProviders(
      <PreviewBlock
        block={block([{ id: "r1", values: { col_voie: "dalle" } }], [custom])}
        customMetrics={[voie]}
      />,
    );

    expect(container.textContent).toContain("dalle 6b+");
  });
});
