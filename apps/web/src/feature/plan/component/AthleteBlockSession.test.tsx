import { readScheduledBlocks } from "@cmv/shared";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AthleteBlockSession } from "@/feature/plan/component/AthleteBlockSession";
import { blockSession } from "../../../../test/block-session";
import { renderWithProviders } from "../../../../test/render";

// La consigne et les documents ont leur test (`AthleteExerciseCard`) : ici, on vérifie qu'ils sont
// posés, sous chaque exercice.
vi.mock("@/feature/plan/component/AthleteExerciseExtras", () => ({
  AthleteExerciseExtras: ({ exercise }: Readonly<{ exercise: { id: string } }>) => (
    <span>{`extras ${exercise.id}`}</span>
  ),
}));

const blocks = readScheduledBlocks(blockSession());
const allSets = [0, 1, 2, 3].map((row) => ({ key: "a1", row }));

describe("AthleteBlockSession", () => {
  it("lit chaque bloc, ses exercices et leurs extras, ancrés pour le sommaire", () => {
    const { container } = renderWithProviders(
      <AthleteBlockSession blocks={blocks} tracking={{}} selected={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("plan.athlete.blocks.count")).toBeTruthy();
    expect(container.querySelector("#block-blk-3")).not.toBeNull();
    expect(screen.getByText("Tabata")).toBeTruthy();
    expect(screen.getByText("extras sx-3")).toBeTruthy();
  });

  it("choisit le bloc dont on ouvre « Mon suivi », et le fait ressortir", () => {
    const onSelect = vi.fn();
    const { container, rerender } = renderWithProviders(
      <AthleteBlockSession blocks={blocks} tracking={{}} selected={null} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getAllByText("plan.athlete.blocks.tracking")[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith("blk-2");

    rerender(
      <AthleteBlockSession blocks={blocks} tracking={{}} selected="blk-2" onSelect={onSelect} />,
    );
    expect(container.querySelector("#block-blk-2")?.className).toContain("ring-cmv-accent-line");
  });

  it("montre le décompte d'un bloc coché, en vert quand il est fini", () => {
    renderWithProviders(
      <AthleteBlockSession
        blocks={blocks}
        tracking={{ "blk-1": { checked: allSets }, "blk-3": { checked: [{ key: "c1", row: 0 }] } }}
        selected={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("block.tally.done")).toBeTruthy();
    expect(screen.getByText("block.tally.firstRoundInProgress")).toBeTruthy();
  });
});
