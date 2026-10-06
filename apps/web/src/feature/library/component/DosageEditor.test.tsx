import {
  AdjustmentLevel,
  type Adjustments,
  BlockType,
  type ExerciseBlocks,
  structurePath,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { DosageEditor } from "./DosageEditor";

const REVERT = "library.session.revert";

const blocks: ExerciseBlocks = [
  {
    id: "blk",
    label: null,
    structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: 180 },
    metrics: [],
    rows: [],
  },
];

function setup(level: AdjustmentLevel, adjustments: Adjustments) {
  const onRevertStructureField = vi.fn();
  const view = renderWithProviders(
    <DosageEditor
      dosage={{ blocks, baseline: blocks, adjustments }}
      level={level}
      customMetrics={[]}
      onCellChange={vi.fn()}
      onStructureChange={vi.fn()}
      onRowsChange={vi.fn()}
      onRevertCell={vi.fn()}
      onRevertStructureField={onRevertStructureField}
    />,
  );
  return { ...view, onRevertStructureField };
}

const setCount = (level: AdjustmentLevel) => [{ path: structurePath("blk", "setCount"), level }];

describe("DosageEditor — paramètres de bandeau ajustés", () => {
  it("offre de revenir sur un paramètre ajusté au niveau qui édite", async () => {
    const { user, getByRole, onRevertStructureField } = setup(
      AdjustmentLevel.SCHEDULED,
      setCount(AdjustmentLevel.SCHEDULED),
    );

    await user.click(getByRole("button", { name: REVERT }));

    expect(onRevertStructureField).toHaveBeenCalledExactlyOnceWith("blk", "setCount");
  });

  // #518 : « × 4 séries · séance » — la valeur reçue de la séance-type, qu'il n'y a pas à annuler.
  it("dit seulement d'où vient un paramètre ajusté à un niveau précédent", () => {
    const { getByText, queryByRole } = setup(
      AdjustmentLevel.SCHEDULED,
      setCount(AdjustmentLevel.SESSION),
    );

    expect(getByText("library.dosage.inherited")).toBeInTheDocument();
    expect(queryByRole("button", { name: REVERT })).not.toBeInTheDocument();
  });

  it("n'affiche ni marqueur ni retour sous le bandeau sans paramètre ajusté", () => {
    const { queryByText, queryByRole } = setup(AdjustmentLevel.SESSION, []);

    expect(queryByText("library.dosage.inherited")).not.toBeInTheDocument();
    expect(queryByRole("button", { name: REVERT })).not.toBeInTheDocument();
  });
});
