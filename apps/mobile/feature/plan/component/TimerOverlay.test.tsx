import {
  type BlockSegment,
  BlockType,
  exerciseBlockSchema,
  MetricKey,
  MetricSource,
  MetricUnit,
  SegmentKind,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { TimerOverlay } from "@/feature/plan/component/TimerOverlay";
import { press, pressButton, renderRn } from "@/test/render";

const block = exerciseBlockSchema.parse({
  id: "blk_1",
  label: null,
  structure: { type: BlockType.SERIES, setCount: 2, restBetweenSetsSeconds: 60 },
  metrics: [
    {
      id: "col_reps",
      source: MetricSource.CATALOG,
      key: MetricKey.REPETITIONS,
      unit: MetricUnit.REPS,
      label: null,
      collapsed: false,
    },
  ],
  rows: [{ id: "r1", values: { col_reps: 6 } }],
});

const segment = (kind: BlockSegment["kind"]): BlockSegment => ({
  kind,
  seconds: 45,
  unitIndex: 0,
  rowId: "r1",
});

function renderOverlay(over: Partial<Parameters<typeof TimerOverlay>[0]> = {}) {
  const props = {
    title: "Tractions",
    block,
    customMetrics: [],
    current: segment(SegmentKind.EFFORT),
    remaining: 30,
    total: 45,
    totalRemaining: 150,
    position: "segment 1 sur 3",
    isPaused: false,
    armed: true,
    checked: [],
    rounds: 0,
    onConfirm: vi.fn(),
    onUnitDone: vi.fn(),
    onRoundDone: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onSkip: vi.fn(),
    onAdd: vi.fn(),
    onStop: vi.fn(),
    onReduce: vi.fn(),
    ...over,
  };
  return { props, ...renderRn(<TimerOverlay {...props} />) };
}

describe("TimerOverlay — l'en-tête", () => {
  it("situe le segment dans le déroulé", () => {
    const { getByText } = renderOverlay();

    expect(getByText("segment 1 sur 3")).toBeTruthy();
  });

  it("ne situe rien quand il n'y a rien à situer", () => {
    const { container } = renderOverlay({ position: null });

    expect(container.textContent).not.toContain("sur 3");
  });

  it("se réduit", () => {
    const { props, getByLabelText } = renderOverlay();

    press(getByLabelText("plan.timer.reduce"));

    expect(props.onReduce).toHaveBeenCalledOnce();
  });
});

describe("TimerOverlay — le geste propre au segment", () => {
  /** Chaque nature a SON geste ; un effort minuté n'en a pas — il se termine tout seul. */
  it.each([
    [SegmentKind.MANUAL, "plan.timer.confirm", "onConfirm"],
    [SegmentKind.INTERVAL, "plan.timer.topDone", "onUnitDone"],
    [SegmentKind.COUNTDOWN, "plan.timer.roundDone", "onRoundDone"],
  ] as const)("un segment %s se clôt par %s", (kind, label, handler) => {
    const { props, container } = renderOverlay({ current: segment(kind) });

    pressButton(container, label);

    expect(props[handler]).toHaveBeenCalledOnce();
  });

  it("n'offre aucun geste principal sur un effort minuté", () => {
    const { container } = renderOverlay();

    for (const label of ["plan.timer.confirm", "plan.timer.topDone", "plan.timer.roundDone"]) {
      expect(container.textContent).not.toContain(label);
    }
  });
});

describe("TimerOverlay — le chrono", () => {
  it("met en pause un chrono qui court", () => {
    const { props, container } = renderOverlay();

    pressButton(container, "plan.timer.pause");

    expect(props.onPause).toHaveBeenCalledOnce();
  });

  it("reprend un chrono en pause", () => {
    const { props, container } = renderOverlay({ isPaused: true });

    pressButton(container, "plan.timer.resume");

    expect(props.onResume).toHaveBeenCalledOnce();
    expect(props.onPause).not.toHaveBeenCalled();
  });

  /** Un segment manuel n'a pas de temps : ni pause, ni « + 30 s » — seulement « C'est fait ». */
  it("retire la pause et l'ajout pendant un segment manuel", () => {
    const { container } = renderOverlay({ current: segment(SegmentKind.MANUAL) });

    expect(container.textContent).not.toContain("plan.timer.pause");
    expect(container.textContent).not.toContain("plan.timer.add");
  });

  it.each([
    ["plan.timer.add", "onAdd"],
    ["plan.timer.skipSegment", "onSkip"],
    ["plan.timer.stop", "onStop"],
  ] as const)("relaie %s", (label, handler) => {
    const { props, container } = renderOverlay();

    pressButton(container, label);

    expect(props[handler]).toHaveBeenCalledOnce();
  });

  it("dit que le chrono ne sonnera pas téléphone rangé", () => {
    const { getByText } = renderOverlay({ armed: false });

    expect(getByText("plan.timer.notArmed")).toBeTruthy();
  });
});
