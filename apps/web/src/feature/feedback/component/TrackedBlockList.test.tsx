import { STRUCTURE_PRESETS, type TrackedBlockDto } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackedBlockList } from "@/feature/feedback/component/TrackedBlockList";
import { renderWithProviders } from "../../../../test/render";

const tracked = (over: Partial<TrackedBlockDto>): TrackedBlockDto => ({
  blockId: "blk-1",
  label: null,
  name: "Séries",
  settings: STRUCTURE_PRESETS.SERIES,
  exerciseKeys: ["a1"],
  tracking: null,
  ...over,
});

describe("TrackedBlockList", () => {
  it("ne montre rien d'une séance sans bloc", () => {
    const { container } = renderWithProviders(<TrackedBlockList blocks={[]} />);

    expect(container.textContent).toBe("");
  });

  it("lit le décompte de chaque bloc pour le coach, par son nom ou son libellé", () => {
    renderWithProviders(
      <TrackedBlockList
        blocks={[
          tracked({ tracking: { checked: [0, 1, 2, 3].map((row) => ({ key: "a1", row })) } }),
          tracked({ blockId: "blk-2", label: "Finisher", name: "AMRAP" }),
          tracked({ blockId: "blk-3", tracking: { checked: [{ key: "a1", row: 0 }] } }),
        ]}
      />,
    );

    expect(screen.getByText("Finisher")).toBeTruthy();
    expect(screen.queryByText("AMRAP")).toBeNull();
    expect(screen.getByText("block.tally.done")).toBeTruthy();
    expect(screen.getByText("feedback.tracking.untracked")).toBeTruthy();
    expect(screen.getByText("block.tally.sets")).toBeTruthy();
  });
});
