import type { TrackedBlockDto } from "@cmv/shared";
import { STRUCTURE_PRESETS } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackedBlockList } from "@/feature/feedback/component/TrackedBlockList";
import { renderRn } from "@/test/render";

const allSets = [0, 1, 2, 3].map((row) => ({ key: "a1", row }));

describe("TrackedBlockList", () => {
  const tracked = (over: Partial<TrackedBlockDto>): TrackedBlockDto => ({
    blockId: "blk-1",
    label: null,
    name: "Séries",
    settings: STRUCTURE_PRESETS.SERIES,
    exerciseKeys: ["a1"],
    tracking: null,
    ...over,
  });

  it("ne montre rien d'une séance sans bloc", () => {
    const { container } = renderRn(<TrackedBlockList blocks={[]} />);

    expect(container.textContent).toBe("");
  });

  it("lit le décompte de chaque bloc pour le coach, numéros et libellés compris", () => {
    renderRn(
      <TrackedBlockList
        blocks={[
          tracked({ tracking: { checked: allSets } }),
          tracked({ blockId: "blk-2", label: "Finisher", name: "AMRAP" }),
        ]}
      />,
    );

    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Finisher")).toBeTruthy();
    expect(screen.getByText("block.tally.done")).toBeTruthy();
    expect(screen.getByText("feedback.tracking.untracked")).toBeTruthy();
  });

  it("dit un décompte partiel autrement qu'un bloc fini", () => {
    renderRn(
      <TrackedBlockList blocks={[tracked({ tracking: { checked: [{ key: "a1", row: 0 }] } })]} />,
    );

    expect(screen.queryByText("block.tally.done")).toBeNull();
    expect(screen.queryByText("feedback.tracking.untracked")).toBeNull();
  });
});
