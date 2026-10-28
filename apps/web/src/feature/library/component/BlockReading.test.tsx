import { STRUCTURE_PRESETS } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockReading, type BlockReadingExercise } from "@/feature/library/component/BlockReading";
import { repsGrid } from "../../../../test/block-session";
import { renderWithProviders } from "../../../../test/render";

const exercise = (over: Partial<BlockReadingExercise> = {}): BlockReadingExercise => ({
  id: "row-1",
  name: "Squat",
  grid: repsGrid(8),
  note: null,
  customMetrics: [],
  ...over,
});

describe("BlockReading", () => {
  it("lit un bloc fait une fois par son libellé, ses valeurs sans « à chaque tour »", () => {
    renderWithProviders(
      <BlockReading
        number={null}
        label="Échauffement"
        settings={STRUCTURE_PRESETS.FREE}
        instructions="Sans charge"
        exercises={[exercise({ note: "Lent" })]}
      />,
    );

    expect(screen.getByText("Échauffement")).toBeTruthy();
    expect(screen.getByText("Sans charge")).toBeTruthy();
    expect(screen.getByText("Lent")).toBeTruthy();
    expect(screen.queryByText(/block\.grid\.each/)).toBeNull();
  });

  it("dit « à chaque série » quand toutes les séries se ressemblent", () => {
    renderWithProviders(
      <BlockReading
        number="1"
        label={null}
        settings={STRUCTURE_PRESETS.SERIES}
        instructions={null}
        exercises={[exercise({ grid: repsGrid(8, 8) })]}
      />,
    );

    expect(screen.getByText(/block\.grid\.eachSet/)).toBeTruthy();
  });

  it("lit série par série quand elles diffèrent", () => {
    renderWithProviders(
      <BlockReading
        number="1"
        label={null}
        settings={STRUCTURE_PRESETS.SERIES}
        instructions={null}
        exercises={[exercise({ grid: repsGrid(8, 6) })]}
      />,
    );

    expect(screen.getAllByText(/block\.grid\.set/)).toHaveLength(2);
  });
});
