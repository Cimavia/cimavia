import {
  type BlockMetric,
  BlockType,
  columnValues,
  type ExerciseBlock,
  MetricKey,
  MetricSource,
  MetricUnit,
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

function setup(block: ExerciseBlock) {
  const onChange = vi.fn();
  const view = renderWithProviders(
    <ColumnMenu
      block={block}
      metric={block.metrics[0] as BlockMetric}
      customMetrics={[]}
      openMetricId="col"
      onOpenChange={vi.fn()}
      onChange={onChange}
    />,
  );
  const filled = () => columnValues(onChange.mock.calls[0]?.[0] as ExerciseBlock, "col");
  return { ...view, onChange, filled };
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
