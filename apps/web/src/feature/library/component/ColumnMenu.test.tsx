import {
  ColumnFillMode,
  type CustomMetric,
  type GridMetric,
  MetricKey,
  MetricSource,
  MetricUnit,
  type MetricValue,
  MetricValueType,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ColumnPopover } from "./ColumnMenu";

const STEP = "library.builder.column.stepLabel";
const FILL_STEP = "library.builder.column.fillStep";
const FILL_SCALE_STEP = "library.builder.column.fillScaleStep";

const column = (key: MetricKey, unit: MetricUnit): GridMetric => ({
  id: "col",
  source: MetricSource.CATALOG,
  key,
  unit,
  label: null,
});

const load = column(MetricKey.LOAD, MetricUnit.KILOGRAMS);
const grade = column(MetricKey.GRADE, MetricUnit.NONE);

function setup(
  metric: GridMetric,
  firstValue: MetricValue,
  {
    open = true,
    hasRows = true,
    customMetrics = [],
  }: { open?: boolean; hasRows?: boolean; customMetrics?: CustomMetric[] } = {},
) {
  const onFill = vi.fn();
  const onUnit = vi.fn();
  const onOpenChange = vi.fn();
  const view = renderWithProviders(
    <ColumnPopover
      metric={metric}
      customMetrics={customMetrics}
      open={open}
      onOpenChange={onOpenChange}
      firstValue={firstValue}
      hasRows={hasRows}
      onUnit={onUnit}
      onFill={onFill}
    />,
  );
  return { ...view, onFill, onUnit, onOpenChange };
}

describe("ColumnPopover — progression régulière", () => {
  it("part d'un pas de 2 à l'ouverture", async () => {
    const { user, getByRole, onFill } = setup(load, 10);

    await user.click(getByRole("button", { name: FILL_STEP }));

    expect(onFill).toHaveBeenCalledExactlyOnceWith({
      mode: ColumnFillMode.STEP,
      start: 10,
      step: 2,
    });
  });

  /** Le cas de #332 : `parseInt` coupait « 2,5 » en 2, et la grille se remplissait sans un mot. */
  it.each(["2,5", "2.5"])("progresse d'un pas décimal tapé « %s »", async (typed) => {
    const { user, getByRole, onFill } = setup(load, 10);

    await user.clear(getByRole("textbox", { name: STEP }));
    await user.type(getByRole("textbox", { name: STEP }), typed);
    await user.click(getByRole("button", { name: FILL_STEP }));

    expect(onFill).toHaveBeenCalledExactlyOnceWith({
      mode: ColumnFillMode.STEP,
      start: 10,
      step: 2.5,
    });
  });

  it.each([
    ["abc", "du texte"],
    ["0", "un pas nul"],
    ["2,5,1", "deux séparateurs"],
  ])("ferme le bouton sur « %s » — %s", async (typed) => {
    const { user, getByRole } = setup(load, 10);

    await user.clear(getByRole("textbox", { name: STEP }));
    await user.type(getByRole("textbox", { name: STEP }), typed);

    expect(getByRole("button", { name: FILL_STEP })).toBeDisabled();
  });

  it("ferme le bouton sur un champ vidé, au lieu d'y lire zéro", async () => {
    const { user, getByRole } = setup(load, 10);

    await user.clear(getByRole("textbox", { name: STEP }));

    expect(getByRole("button", { name: FILL_STEP })).toBeDisabled();
  });

  it("ferme la progression quand la première ligne n'a pas de nombre", () => {
    const { getByRole } = setup(load, null);

    expect(getByRole("button", { name: FILL_STEP })).toBeDisabled();
  });
});

describe("ColumnPopover — progression sur une échelle", () => {
  it("avance d'un nombre entier de paliers", async () => {
    const { user, getByRole, onFill } = setup(grade, "6a");

    await user.clear(getByRole("textbox", { name: STEP }));
    await user.type(getByRole("textbox", { name: STEP }), "1");
    await user.click(getByRole("button", { name: FILL_SCALE_STEP }));

    expect(onFill).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ mode: ColumnFillMode.SCALE_STEP, start: "6a", step: 1 }),
    );
  });

  /** Un palier et demi n'existe pas : le bouton se ferme plutôt que d'arrondir en silence. */
  it("refuse un pas décimal", async () => {
    const { user, getByRole } = setup(grade, "6a");

    await user.clear(getByRole("textbox", { name: STEP }));
    await user.type(getByRole("textbox", { name: STEP }), "1,5");

    expect(getByRole("button", { name: FILL_SCALE_STEP })).toBeDisabled();
  });

  it("ferme la progression d'échelle quand la première ligne n'a pas de palier", () => {
    const { getByRole } = setup(grade, null);

    expect(getByRole("button", { name: FILL_SCALE_STEP })).toBeDisabled();
  });
});

describe("ColumnPopover — ouverture", () => {
  it("s'ouvre au clic sur l'en-tête", async () => {
    const { user, getByRole, onOpenChange, queryByText } = setup(load, 10, { open: false });

    expect(queryByText("library.builder.column.fill")).not.toBeInTheDocument();
    await user.click(getByRole("button", { expanded: false }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("se referme au second clic sur l'en-tête", async () => {
    const { user, getByRole, onOpenChange } = setup(load, 10);

    await user.click(getByRole("button", { expanded: true }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe("ColumnPopover — unité", () => {
  it("change l'unité de la colonne", async () => {
    const { user, getByRole, onUnit } = setup(load, 10);

    await user.selectOptions(
      getByRole("combobox", { name: "library.builder.column.unit" }),
      MetricUnit.PERCENT_BODYWEIGHT,
    );

    expect(onUnit).toHaveBeenCalledExactlyOnceWith(MetricUnit.PERCENT_BODYWEIGHT);
  });

  // Une seule unité admise : un select à une option serait du bruit.
  it("n'offre aucun choix d'unité quand la métrique n'en admet qu'une", () => {
    const { queryByRole } = setup(grade, "6a");

    expect(
      queryByRole("combobox", { name: "library.builder.column.unit" }),
    ).not.toBeInTheDocument();
  });

  // L'unité d'une métrique maison est portée par sa définition, pas par la colonne.
  it("n'offre aucun choix d'unité sur une métrique maison", () => {
    const custom: GridMetric = {
      id: "col",
      source: MetricSource.CUSTOM,
      customMetricId: "m-1",
      label: null,
    };
    const { queryByRole, getByRole } = setup(custom, 3, {
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

describe("ColumnPopover — remplissage", () => {
  it.each([
    [
      ColumnFillMode.SAME,
      "library.builder.column.fillSame",
      { mode: ColumnFillMode.SAME, value: 10 },
    ],
    [ColumnFillMode.MIRROR, "library.builder.column.fillMirror", { mode: ColumnFillMode.MIRROR }],
  ] as const)("demande le mode %s à partir de la première ligne", async (_mode, name, plan) => {
    const { user, getByRole, onFill } = setup(load, 10);

    await user.click(getByRole("button", { name }));

    expect(onFill).toHaveBeenCalledExactlyOnceWith(plan);
  });

  // Sans ligne, un menu à moitié vide se lirait comme un bug : il dit ce qui manque.
  it("dit qu'il faut une ligne, sans remplissage, sur une grille vide", () => {
    const { getByText, queryByRole } = setup(load, null, { hasRows: false });

    expect(getByText("library.builder.column.needsRow")).toBeInTheDocument();
    expect(
      queryByRole("button", { name: "library.builder.column.fillSame" }),
    ).not.toBeInTheDocument();
  });
});
