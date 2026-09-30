import { type TrackedExerciseDto, TrackingState, TrackingUnit } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { TrackedExerciseList } from "./TrackedExerciseList";

const tracked = (
  over: Partial<TrackedExerciseDto> & Pick<TrackedExerciseDto, "exerciseId" | "title">,
) => ({
  state: TrackingState.UNTRACKED,
  done: 0,
  total: 3,
  unit: TrackingUnit.SET,
  ...over,
});

/** Le décompte tel que le COACH le lit : en lecture, sans jugement. */
describe("TrackedExerciseList", () => {
  it("ne rend rien quand aucun exercice n'a d'unité à cocher", () => {
    const { container } = renderWithProviders(
      <TrackedExerciseList
        exercises={[tracked({ exerciseId: "e1", title: "Étirements", unit: null })]}
      />,
    );

    // Le fournisseur de toasts rend sa propre zone : c'est la section qu'on cherche.
    expect(container.querySelector("section")).toBeNull();
  });

  it("dit l'absence de décompte en gris, jamais en reproche", () => {
    const { getByText, queryByText } = renderWithProviders(
      <TrackedExerciseList
        exercises={[
          tracked({ exerciseId: "e1", title: "Traction" }),
          tracked({ exerciseId: "e2", title: "Étirements", unit: null }),
        ]}
      />,
    );

    expect(getByText("feedback.tracking.untracked")).toHaveClass("text-cmv-text-lo");
    // Un exercice sans unité ne figure même pas : il n'y avait rien à cocher.
    expect(queryByText("Étirements")).toBeNull();
  });

  it("colore l'achevé en succès et l'entamé en accent, dans l'unité de l'exercice", () => {
    const { getByText } = renderWithProviders(
      <TrackedExerciseList
        exercises={[
          tracked({ exerciseId: "e1", title: "Traction", state: TrackingState.DONE, done: 3 }),
          tracked({
            exerciseId: "e2",
            title: "Circuit",
            state: TrackingState.PARTIAL,
            done: 1,
            unit: TrackingUnit.ROUND,
          }),
        ]}
      />,
    );

    expect(getByText("plan.tracking.count.SET")).toHaveClass("text-cmv-success");
    expect(getByText("plan.tracking.count.ROUND")).toHaveClass("text-cmv-accent");
  });
});
