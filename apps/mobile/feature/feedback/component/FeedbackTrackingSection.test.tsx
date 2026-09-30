import {
  BlockType,
  type ExerciseBlock,
  exerciseBlockSchema,
  MetricKey,
  MetricSource,
  MetricUnit,
  type ScheduledSessionExerciseDto,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { FeedbackTrackingSection } from "@/feature/feedback/component/FeedbackTrackingSection";
import { press, renderRn } from "@/test/render";

const reps = {
  id: "col_reps",
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
  label: null,
  collapsed: false,
} as const;

const block = (id: string, type: "SERIES" | "AMRAP"): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id,
    label: null,
    structure:
      type === BlockType.SERIES
        ? { type: BlockType.SERIES, setCount: 2, restBetweenSetsSeconds: null }
        : { type: BlockType.AMRAP, totalDurationSeconds: 600, targetRounds: null },
    metrics: [reps],
    rows: [{ id: "r1", values: { col_reps: 6 } }],
  });

const exercise = (id: string, blocks: ExerciseBlock[]): ScheduledSessionExerciseDto =>
  ({
    id,
    title: `Exercice ${id}`,
    blocks,
    customMetrics: [],
    documents: [],
  }) as unknown as ScheduledSessionExerciseDto;

const series = exercise("ex-series", [block("b-series", BlockType.SERIES)]);
const amrap = exercise("ex-amrap", [block("b-amrap", BlockType.AMRAP)]);

function renderSection(
  exercises: ScheduledSessionExerciseDto[],
  tracking: Parameters<typeof FeedbackTrackingSection>[0]["tracking"] = {},
) {
  const handlers = { onToggleUnit: vi.fn(), onRounds: vi.fn() };
  return {
    handlers,
    ...renderRn(
      <FeedbackTrackingSection exercises={exercises} tracking={tracking} {...handlers} />,
    ),
  };
}

const boxes = (container: HTMLElement) => container.querySelectorAll('[role="checkbox"]');

describe("FeedbackTrackingSection — le rappel", () => {
  it("ne pose aucune section quand aucun exercice n'a rien à cocher", () => {
    const { container } = renderSection([exercise("ex-libre", [])]);

    expect(container.textContent).toBe("");
  });

  /** « Pas de décompte », en gris : le terme nomme ce qui MANQUE, pas ce que l'athlète aurait omis. */
  it("dit « pas de décompte » sur un exercice que l'athlète n'a pas suivi", () => {
    const { getByText } = renderSection([series]);

    expect(getByText("feedback.tracking.untracked")).toBeTruthy();
  });

  it("rappelle l'avancement d'un exercice commencé comme d'un exercice terminé", () => {
    const { getAllByText } = renderSection([series, exercise("ex-2", [block("b-2", "SERIES")])], {
      "ex-series": { "b-series": { checked: [0] } },
      "ex-2": { "b-2": { checked: [0, 1] } },
    });

    expect(getAllByText("plan.tracking.count.SET")).toHaveLength(2);
  });

  it("replie les cases tant qu'on ne demande pas à corriger", () => {
    const { container } = renderSection([series]);

    expect(boxes(container)).toHaveLength(0);
  });
});

describe("FeedbackTrackingSection — la correction", () => {
  it("déplie les cases d'un exercice, et elles seules, puis les replie", () => {
    const { container, getAllByLabelText, getByText, queryByLabelText } = renderSection([
      series,
      amrap,
    ]);

    press(getAllByLabelText("feedback.tracking.edit")[0] as HTMLElement);
    expect(boxes(container)).toHaveLength(2);
    expect(queryByLabelText("plan.tracking.roundsPlus")).toBeNull();
    expect(getByText("feedback.tracking.close")).toBeTruthy();

    press(getByText("feedback.tracking.close"));
    expect(boxes(container)).toHaveLength(0);
  });

  it("rapporte la case corrigée à son exercice et à son bloc", () => {
    const { container, getAllByLabelText, handlers } = renderSection([series]);
    press(getAllByLabelText("feedback.tracking.edit")[0] as HTMLElement);

    press(boxes(container)[1] as HTMLElement);

    expect(handlers.onToggleUnit).toHaveBeenCalledExactlyOnceWith("ex-series", "b-series", 1);
  });

  it("rapporte les tours corrigés à leur exercice et à leur bloc", () => {
    const { getAllByLabelText, getByLabelText, handlers } = renderSection([amrap], {
      "ex-amrap": { "b-amrap": { rounds: 3 } },
    });
    press(getAllByLabelText("feedback.tracking.edit")[0] as HTMLElement);

    press(getByLabelText("plan.tracking.roundsPlus"));

    expect(handlers.onRounds).toHaveBeenCalledExactlyOnceWith("ex-amrap", "b-amrap", 4);
  });
});
