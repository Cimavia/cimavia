import {
  type BlockMetric,
  BlockType,
  ColumnFillMode,
  type CustomMetric,
  columnValues,
  type ExerciseBlock,
  fillColumn,
  MetricKey,
  MetricSource,
  MetricUnit,
  MetricValueType,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ColumnMenu } from "./ColumnMenu";

const STEP = "library.builder.column.stepLabel";
const FILL_STEP = "library.builder.column.fillStep";
const FILL_SCALE_STEP = "library.builder.column.fillScaleStep";

const column = (key: MetricKey, unit: MetricUnit): BlockMetric => ({
  id: "col",
  source: MetricSource.CATALOG,
  key,
  unit,
  label: null,
  collapsed: false,
});

const load = column(MetricKey.LOAD, MetricUnit.KILOGRAMS);
const grade = column(MetricKey.GRADE, MetricUnit.NONE);

const blockWith = (metric: BlockMetric, first: number | string): ExerciseBlock => ({
  id: "block-1",
  label: null,
  structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
  metrics: [metric],
  rows: [first, null, null, null].map((value, index) => ({
    id: `r${index}`,
    values: { col: value },
  })),
});

function setup(
  block: ExerciseBlock,
  {
    openMetricId = "col",
    customMetrics = [],
  }: { openMetricId?: string | null; customMetrics?: CustomMetric[] } = {},
) {
  const onChange = vi.fn();
  const onOpenChange = vi.fn();
  const view = renderWithProviders(
    <ColumnMenu
      block={block}
      metric={block.metrics[0] as BlockMetric}
      customMetrics={customMetrics}
      openMetricId={openMetricId}
      onOpenChange={onOpenChange}
      onChange={onChange}
    />,
  );
  const written = () => onChange.mock.calls[0]?.[0] as ExerciseBlock;
  const filled = () => columnValues(written(), "col");
  return { ...view, onChange, onOpenChange, written, filled };
}

describe("ColumnMenu — progression régulière", () => {
  it("part d'un pas de 2 à l'ouverture", async () => {
    const { user, getByRole, filled } = setup(blockWith(load, 10));

    await user.click(getByRole("button", { name: FILL_STEP }));

    expect(filled()).toEqual([10, 12, 14, 16]);
  });

  /** Le cas de #332 : `parseInt` coupait « 2,5 » en 2, et la grille se remplissait sans un mot. */
  it.each(["2,5", "2.5"])("progresse d'un pas décimal tapé « %s »", async (typed) => {
    const { user, getByRole, filled } = setup(blockWith(load, 10));

    await user.clear(getByRole("textbox", { name: STEP }));
    await user.type(getByRole("textbox", { name: STEP }), typed);
    await user.click(getByRole("button", { name: FILL_STEP }));

    expect(filled()).toEqual([10, 12.5, 15, 17.5]);
  });

  it.each([
    ["abc", "du texte"],
    ["0", "un pas nul"],
    ["2,5,1", "deux séparateurs"],
  ])("ferme le bouton sur « %s » — %s", async (typed) => {
    const { user, getByRole } = setup(blockWith(load, 10));

    await user.clear(getByRole("textbox", { name: STEP }));
    await user.type(getByRole("textbox", { name: STEP }), typed);

    expect(getByRole("button", { name: FILL_STEP })).toBeDisabled();
  });

  it("ferme le bouton sur un champ vidé, au lieu d'y lire zéro", async () => {
    const { user, getByRole } = setup(blockWith(load, 10));

    await user.clear(getByRole("textbox", { name: STEP }));

    expect(getByRole("button", { name: FILL_STEP })).toBeDisabled();
  });
});

describe("ColumnMenu — progression sur une échelle", () => {
  it("avance d'un nombre entier de paliers", async () => {
    const { user, getByRole, filled } = setup(blockWith(grade, "6a"));

    await user.clear(getByRole("textbox", { name: STEP }));
    await user.type(getByRole("textbox", { name: STEP }), "1");
    await user.click(getByRole("button", { name: FILL_SCALE_STEP }));

    expect(filled()).toEqual(["6a", "6a+", "6b", "6b+"]);
  });

  /** Un palier et demi n'existe pas : le bouton se ferme plutôt que d'arrondir en silence. */
  it("refuse un pas décimal", async () => {
    const { user, getByRole } = setup(blockWith(grade, "6a"));

    await user.clear(getByRole("textbox", { name: STEP }));
    await user.type(getByRole("textbox", { name: STEP }), "1,5");

    expect(getByRole("button", { name: FILL_SCALE_STEP })).toBeDisabled();
  });
});

/** Le bloc à deux colonnes : la seconde ne doit jamais bouger quand on agit sur la première. */
const withNeighbour = (block: ExerciseBlock): ExerciseBlock => ({
  ...block,
  metrics: [...block.metrics, { ...column(MetricKey.REPETITIONS, MetricUnit.REPS), id: "other" }],
});

const values = (metric: BlockMetric, cells: (number | string | null)[]): ExerciseBlock => ({
  ...blockWith(metric, 0),
  rows: cells.map((value, index) => ({ id: `r${index}`, values: { col: value } })),
});

describe("ColumnMenu — ouverture", () => {
  it("s'ouvre au clic sur l'en-tête, en désignant SA colonne", async () => {
    const { user, getByRole, onOpenChange, queryByText } = setup(blockWith(load, 10), {
      openMetricId: null,
    });

    expect(queryByText("library.builder.column.fill")).not.toBeInTheDocument();
    await user.click(getByRole("button", { expanded: false }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith("col");
  });

  // Un seul menu ouvert pour toute la page : celui d'une autre colonne ferme le sien.
  it("reste fermé quand c'est une autre colonne qui est ouverte", () => {
    const { queryByText, getByRole } = setup(blockWith(load, 10), { openMetricId: "other" });

    expect(getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(queryByText("library.builder.column.fill")).not.toBeInTheDocument();
  });

  it("se referme au second clic sur l'en-tête", async () => {
    const { user, getByRole, onOpenChange } = setup(blockWith(load, 10));

    await user.click(getByRole("button", { expanded: true }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(null);
  });
});

describe("ColumnMenu — unité", () => {
  it("change l'unité de SA colonne, laisse les autres, et se referme", async () => {
    const { user, getByRole, written, onOpenChange } = setup(withNeighbour(blockWith(load, 10)));

    await user.selectOptions(
      getByRole("combobox", { name: "library.builder.column.unit" }),
      MetricUnit.PERCENT_BODYWEIGHT,
    );

    expect(written().metrics.map((metric) => ("unit" in metric ? metric.unit : null))).toEqual([
      MetricUnit.PERCENT_BODYWEIGHT,
      MetricUnit.REPS,
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  // Une seule unité admise : un select à une option serait du bruit.
  it("n'offre aucun choix d'unité quand la métrique n'en admet qu'une", () => {
    const { queryByRole } = setup(blockWith(grade, "6a"));

    expect(
      queryByRole("combobox", { name: "library.builder.column.unit" }),
    ).not.toBeInTheDocument();
  });

  // L'unité d'une métrique maison est portée par sa définition, pas par la colonne.
  it("n'offre aucun choix d'unité sur une métrique maison", () => {
    const custom: BlockMetric = {
      id: "col",
      source: MetricSource.CUSTOM,
      customMetricId: "m-1",
      label: null,
      collapsed: false,
    };
    const { queryByRole, getByRole } = setup(blockWith(custom, 3), {
      customMetrics: [
        { id: "m-1", label: "Prises", unit: null, valueType: MetricValueType.NUMBER, scale: null },
      ],
    });

    expect(getByRole("button", { expanded: true })).toHaveTextContent("Prises");
    expect(
      queryByRole("combobox", { name: "library.builder.column.unit" }),
    ).not.toBeInTheDocument();
  });
});

describe("ColumnMenu — remplissage", () => {
  it.each([
    [
      ColumnFillMode.SAME,
      "library.builder.column.fillSame",
      { mode: ColumnFillMode.SAME, value: 10 },
    ],
    [ColumnFillMode.MIRROR, "library.builder.column.fillMirror", { mode: ColumnFillMode.MIRROR }],
  ] as const)("applique le mode %s à partir de la première ligne, et se referme", async (_mode, name, plan) => {
    const block = values(load, [10, 12, null, null]);
    const { user, getByRole, written, onOpenChange } = setup(block);

    await user.click(getByRole("button", { name }));

    // Les valeurs, c'est `fillColumn` qui les décide (testé dans @cmv/shared) ; le menu, lui,
    // décide du MODE et de son point de départ.
    expect(written().rows).toEqual(fillColumn(block, "col", plan));
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  // « Partout », ce sont les QUATRE séries : la troisième ligne a beau manquer, la grille l'affiche.
  it("recopie une première ligne vide comme vide partout", async () => {
    const { user, getByRole, filled } = setup(values(load, [null, 12, 14]));

    await user.click(getByRole("button", { name: "library.builder.column.fillSame" }));

    expect(filled()).toEqual([null, null, null, null]);
  });

  // #520 : deux lignes détaillées, quatre séries. La progression couvre les quatre, pas deux.
  it("remplit les N séries d'une Séries, fantômes compris", async () => {
    const { user, getByRole, written } = setup(values(load, [10, 12]));

    await user.click(getByRole("button", { name: FILL_STEP }));

    expect(columnValues(written(), "col")).toEqual([10, 12, 14, 16]);
    expect(
      written()
        .rows.slice(0, 2)
        .map((row) => row.id),
    ).toEqual(["r0", "r1"]);
  });

  it("ferme la progression quand la première ligne n'a pas de nombre", () => {
    const { getByRole } = setup(values(load, [null, 12]));

    expect(getByRole("button", { name: FILL_STEP })).toBeDisabled();
  });

  it("ferme la progression d'échelle quand la première ligne n'a pas de palier", () => {
    const { getByRole } = setup(values(grade, [null, "6a"]));

    expect(getByRole("button", { name: FILL_SCALE_STEP })).toBeDisabled();
  });

  // Sans ligne, un menu à moitié vide se lirait comme un bug : il dit ce qui manque.
  it("dit qu'il faut une ligne, sans remplissage ni repli, sur une grille vide", () => {
    const { getByText, queryByRole } = setup(values(load, []));

    expect(getByText("library.builder.column.needsRow")).toBeInTheDocument();
    expect(
      queryByRole("button", { name: "library.builder.column.fillSame" }),
    ).not.toBeInTheDocument();
    expect(
      queryByRole("button", { name: "library.builder.column.collapse" }),
    ).not.toBeInTheDocument();
    expect(
      queryByRole("button", { name: "library.builder.column.expand" }),
    ).not.toBeInTheDocument();
  });
});

describe("ColumnMenu — repli", () => {
  it("replie SA colonne quand toutes ses valeurs sont identiques, et se referme", async () => {
    const { user, getByRole, written, onOpenChange, queryByText } = setup(
      withNeighbour(values(load, [10, 10, 10])),
    );

    expect(queryByText("library.builder.column.cannotCollapse")).not.toBeInTheDocument();
    await user.click(getByRole("button", { name: "library.builder.column.collapse" }));

    expect(written().metrics.map((metric) => metric.collapsed)).toEqual([true, false]);
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  // Replier des valeurs différentes afficherait une valeur commune qui n'en est pas une.
  it("refuse le repli, et dit pourquoi, quand les valeurs diffèrent", () => {
    const { getByRole, getByText } = setup(values(load, [10, 12]));

    expect(getByRole("button", { name: "library.builder.column.collapse" })).toBeDisabled();
    expect(getByText("library.builder.column.cannotCollapse")).toBeInTheDocument();
  });

  it("redéploie une colonne repliée, sans message de refus", async () => {
    const block = withNeighbour(values({ ...load, collapsed: true }, [10, 10]));
    const { user, getByRole, written, queryByText } = setup(block);

    expect(queryByText("library.builder.column.cannotCollapse")).not.toBeInTheDocument();
    await user.click(getByRole("button", { name: "library.builder.column.expand" }));

    expect(written().metrics.map((metric) => metric.collapsed)).toEqual([false, false]);
  });
});
