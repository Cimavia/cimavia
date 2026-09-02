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
import { DosageBlock } from "@/feature/plan/component/DosageBlock";
import { renderRn } from "@/test/render";

const column = (id: string, key: MetricKey, unit: MetricUnit, collapsed = false) =>
  ({ id, source: MetricSource.CATALOG, key, unit, label: null, collapsed }) as const;

const reps = column("col_reps", MetricKey.REPETITIONS, MetricUnit.REPS);
const load = column("col_load", MetricKey.LOAD, MetricUnit.KILOGRAMS_ADDED);
const rpe = column("col_rpe", MetricKey.RPE, MetricUnit.NONE);
const grade = column("col_grade", MetricKey.GRADE, MetricUnit.NONE);

const block = (
  rows: ExerciseBlock["rows"],
  metrics: ExerciseBlock["metrics"] = [reps, load],
  label: string | null = null,
): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_1",
    label,
    structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
    metrics,
    rows,
  });

const REPS = METRIC_LABEL_KEY[MetricKey.REPETITIONS];
const LOAD = METRIC_LABEL_KEY[MetricKey.LOAD];
const REPS_UNIT = METRIC_UNIT_LABEL_KEY[MetricUnit.REPS];
const LOAD_UNIT = METRIC_UNIT_LABEL_KEY[MetricUnit.KILOGRAMS_ADDED];

describe("DosageBlock — la phrase (une ligne au plus)", () => {
  it("dit les valeurs de l'unique ligne, unité comprise", () => {
    const { container } = renderRn(
      <DosageBlock
        block={block([{ id: "r1", values: { col_reps: 6, col_load: 12 } }])}
        customMetrics={[]}
      />,
    );

    expect(container.textContent).toContain(`6 ${REPS_UNIT} · 12 ${LOAD_UNIT}`);
  });

  /**
   * Le geste de #137. Le mobile taisait une colonne vide (`""`), le web y mettait « — » : la même
   * donnée se lisait différemment des deux côtés. Taire la colonne fait croire qu'elle n'existe
   * pas — alors qu'elle existe, et qu'elle est vide.
   */
  it("dit « — » sur une colonne vide, au lieu de la taire", () => {
    const { container } = renderRn(
      <DosageBlock block={block([{ id: "r1", values: { col_reps: 6 } }])} customMetrics={[]} />,
    );

    expect(container.textContent).toContain(`6 ${REPS_UNIT} · —`);
  });

  /**
   * « — kg » laisserait croire à une charge nulle. Le tiret reste seul : il dit qu'il n'y a rien,
   * pas qu'il y a zéro (règle dure n°5).
   */
  it("ne colle AUCUNE unité derrière le tiret", () => {
    const { container } = renderRn(
      <DosageBlock block={block([{ id: "r1", values: { col_reps: 6 } }])} customMetrics={[]} />,
    );

    expect(container.textContent).not.toContain(`— ${LOAD_UNIT}`);
  });

  it("ne rend aucune phrase quand le bloc n'a pas de ligne", () => {
    const { container } = renderRn(<DosageBlock block={block([])} customMetrics={[]} />);

    expect(container.textContent).not.toContain(REPS_UNIT);
  });
});

describe("DosageBlock — le tableau (deux à trois colonnes)", () => {
  const twoRows = [
    { id: "r1", values: { col_reps: 6, col_load: 12 } },
    { id: "r2", values: { col_reps: 8, col_load: 10 } },
  ];

  it("coiffe chaque colonne de son libellé, en capitales", () => {
    const { container } = renderRn(<DosageBlock block={block(twoRows)} customMetrics={[]} />);

    expect(container.textContent).toContain(REPS.toUpperCase());
    expect(container.textContent).toContain(LOAD.toUpperCase());
  });

  it("aligne les valeurs NUES sous leur en-tête, sans répéter l'unité à chaque case", () => {
    const { container } = renderRn(<DosageBlock block={block(twoRows)} customMetrics={[]} />);

    expect(container.textContent).toContain("6");
    expect(container.textContent).toContain("8");
    expect(container.textContent).not.toContain(`6 ${REPS_UNIT}`);
  });

  it("met « — » dans la case d'une valeur absente, jamais un zéro", () => {
    const rows = [
      { id: "r1", values: { col_reps: 6 } },
      { id: "r2", values: { col_reps: 8, col_load: 12 } },
    ];
    const { container } = renderRn(<DosageBlock block={block(rows)} customMetrics={[]} />);

    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toContain("0");
  });
});

describe("DosageBlock — les cartes (quatre colonnes et plus)", () => {
  // 362 px utiles moins la colonne d'index : trois colonnes de valeur tiennent, la quatrième non.
  const wide = [reps, load, rpe, grade];
  const rows = [
    { id: "r1", values: { col_reps: 6, col_load: 12, col_rpe: 8, col_grade: "6b" } },
    { id: "r2", values: { col_reps: 8, col_load: 10, col_rpe: 7, col_grade: "6a" } },
  ];

  it("nomme chaque valeur au lieu de compter sur un en-tête lointain", () => {
    const { container } = renderRn(<DosageBlock block={block(rows, wide)} customMetrics={[]} />);

    // Le libellé se répète — une fois par carte — là où le tableau ne l'écrit qu'en tête.
    const occurrences = container.textContent?.split(REPS).length ?? 0;
    expect(occurrences).toBeGreaterThan(2);
  });
});

describe("DosageBlock — le bandeau", () => {
  it("assemble le nom du bloc et la structure", () => {
    const { container } = renderRn(
      <DosageBlock
        block={block(
          [{ id: "r1", values: { col_reps: 6, col_load: 12 } }],
          [reps, load],
          "Travail",
        )}
        customMetrics={[]}
      />,
    );

    expect(container.textContent).toContain("Travail");
  });

  /** Une colonne repliée porte la MÊME valeur partout : elle se dit une fois, dans le bandeau. */
  it("sort la valeur commune d'une colonne repliée dans le bandeau, avec son unité", () => {
    const collapsedLoad = column("col_load", MetricKey.LOAD, MetricUnit.KILOGRAMS_ADDED, true);
    const { container } = renderRn(
      <DosageBlock
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

    expect(container.textContent).toContain(`${LOAD} 12 ${LOAD_UNIT}`);
  });

  it("tait une colonne repliée restée vide, plutôt que d'annoncer un tiret commun", () => {
    const collapsedLoad = column("col_load", MetricKey.LOAD, MetricUnit.KILOGRAMS_ADDED, true);
    const { container } = renderRn(
      <DosageBlock
        block={block(
          [
            { id: "r1", values: { col_reps: 6 } },
            { id: "r2", values: { col_reps: 8 } },
          ],
          [reps, collapsedLoad],
        )}
        customMetrics={[]}
      />,
    );

    expect(container.textContent).not.toContain(LOAD);
  });
});

describe("DosageBlock — les métriques maison", () => {
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
    const { container } = renderRn(
      <DosageBlock
        block={block([{ id: "r1", values: { col_voie: "dalle" } }], [custom])}
        customMetrics={[voie]}
      />,
    );

    expect(container.textContent).toContain("dalle 6b+");
  });

  it("rend « — » quand la métrique maison citée a disparu, jamais son identifiant", () => {
    const { container } = renderRn(
      <DosageBlock
        block={block(
          [
            { id: "r1", values: { col_voie: "dalle" } },
            { id: "r2", values: { col_voie: "devers" } },
          ],
          [custom],
        )}
        customMetrics={[]}
      />,
    );

    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toContain("cm_1");
  });
});
