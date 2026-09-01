import {
  type BlockSegment,
  type ExerciseBlock,
  MetricKey,
  MetricSource,
  MetricUnit,
  SegmentKind,
} from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type RunnerContext, useSegmentRunner } from "./useSegmentRunner";

const block = {
  id: "b-1",
  label: null,
  structure: { type: "SERIES", setCount: 2, restBetweenSetsSeconds: 30 },
  metrics: [
    {
      id: "m-1",
      source: MetricSource.CATALOG,
      key: MetricKey.REPETITIONS,
      unit: MetricUnit.REPS,
      label: null,
      collapsed: false,
    },
  ],
  rows: [],
} as unknown as ExerciseBlock;

const context: RunnerContext = { exerciseId: "e-1", block, customMetrics: [], title: "Tractions" };

const seg = (
  kind: SegmentKind,
  seconds: number,
  unitIndex: number | null = null,
): BlockSegment => ({
  kind,
  seconds,
  unitIndex,
  rowId: null,
});

// Le temps est FAUX ici : le hook lit une échéance absolue (`Date.now()`), et c'est précisément ce
// qu'il faut pouvoir déplacer d'un bloc pour rejouer une app restée en arrière-plan.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const runner = () => {
  const onUnitDone = vi.fn();
  const { result } = renderHook(() => useSegmentRunner(onUnitDone));
  return { result, onUnitDone };
};

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useSegmentRunner — démarrage", () => {
  it("reste inactif tant qu'aucun déroulé n'est lancé", () => {
    const { result } = runner();
    expect(result.current.active).toBe(false);
    expect(result.current.current).toBeNull();
  });

  it("refuse de démarrer sur un déroulé vide", () => {
    const { result } = runner();
    act(() => result.current.start([], context));
    expect(result.current.active).toBe(false);
  });

  it("entre sur le premier segment et affiche sa durée", () => {
    const { result } = runner();
    act(() => result.current.start([seg(SegmentKind.EFFORT, 30, 0)], context));
    expect(result.current.active).toBe(true);
    expect(result.current.remaining).toBe(30);
    expect(result.current.total).toBe(30);
  });

  it("annonce le reste de TOUT le déroulé, pas seulement du segment", () => {
    const { result } = runner();
    act(() =>
      result.current.start(
        [seg(SegmentKind.EFFORT, 30, 0), seg(SegmentKind.REST, 60), seg(SegmentKind.EFFORT, 30, 1)],
        context,
      ),
    );
    expect(result.current.totalRemaining).toBe(120);
  });
});

describe("useSegmentRunner — décompte des unités", () => {
  /**
   * Tenir 30 s de gainage, c'est fait quand les 30 s sont passées : cocher d'office est juste.
   */
  it("coche l'unité d'un effort dont la DURÉE est le travail", () => {
    const { result, onUnitDone } = runner();
    act(() =>
      result.current.start([seg(SegmentKind.EFFORT, 10, 0), seg(SegmentKind.REST, 60)], context),
    );
    advance(10_000);
    expect(onUnitDone).toHaveBeenCalledWith("b-1", 0);
  });

  /**
   * Un top d'EMOM tombe que l'athlète ait fait ses tractions ou non : cocher au passage
   * inventerait un décompte que personne n'a validé. Il a son « Top fait ».
   */
  it.each([
    ["un intervalle", SegmentKind.INTERVAL],
    ["un compte à rebours", SegmentKind.COUNTDOWN],
  ])("ne coche RIEN au passage %s", (_cas, kind) => {
    const { result, onUnitDone } = runner();
    act(() => result.current.start([seg(kind, 10, 0), seg(SegmentKind.REST, 60)], context));
    advance(10_000);
    expect(onUnitDone).not.toHaveBeenCalled();
  });

  it("ne coche rien sur un segment qui ne clôt aucune unité", () => {
    const { result, onUnitDone } = runner();
    act(() =>
      result.current.start([seg(SegmentKind.REST, 10), seg(SegmentKind.EFFORT, 30, 0)], context),
    );
    advance(10_000);
    expect(onUnitDone).not.toHaveBeenCalled();
  });
});

describe("useSegmentRunner — segment manuel", () => {
  const manual = [seg(SegmentKind.MANUAL, 0, 0), seg(SegmentKind.REST, 60)];

  it("attend le geste de l'athlète, sans échéance ni décompte", () => {
    const { result } = runner();
    act(() => result.current.start(manual, context));
    expect(result.current.awaiting).toBe(true);
    expect(result.current.deadline).toBeNull();
  });

  it("ne bouge pas tout seul, même après une heure", () => {
    const { result } = runner();
    act(() => result.current.start(manual, context));
    advance(3_600_000);
    expect(result.current.index).toBe(0);
    expect(result.current.awaiting).toBe(true);
  });

  it("coche l'unité et donne le départ du repos quand l'athlète confirme", () => {
    const { result, onUnitDone } = runner();
    act(() => result.current.start(manual, context));
    act(() => result.current.confirm());
    expect(onUnitDone).toHaveBeenCalledWith("b-1", 0);
    expect(result.current.index).toBe(1);
    expect(result.current.remaining).toBe(60);
  });

  it("clôt le déroulé quand le geste portait sur le dernier segment", () => {
    const { result } = runner();
    act(() => result.current.start([seg(SegmentKind.MANUAL, 0, 0)], context));
    act(() => result.current.confirm());
    expect(result.current.active).toBe(false);
  });
});

describe("useSegmentRunner — rattrapage après une mise en veille", () => {
  /**
   * Le cas qui justifie l'échéance absolue plutôt qu'un décrément : l'app est gelée en arrière-plan
   * et l'athlète rouvre trois segments plus loin. Il doit retrouver le BON, pas celui qu'il a
   * quitté — et chaque unité traversée doit avoir été cochée.
   */
  it("traverse plusieurs segments d'un coup et coche chacun au passage", () => {
    const { result, onUnitDone } = runner();
    act(() =>
      result.current.start(
        [
          seg(SegmentKind.EFFORT, 10, 0),
          seg(SegmentKind.REST, 10),
          seg(SegmentKind.EFFORT, 10, 1),
          seg(SegmentKind.REST, 60),
        ],
        context,
      ),
    );

    advance(31_000);

    expect(onUnitDone).toHaveBeenCalledWith("b-1", 0);
    expect(onUnitDone).toHaveBeenCalledWith("b-1", 1);
    expect(result.current.index).toBe(3);
  });

  // Après un MANUEL, rien ne s'est écoulé sans l'athlète : le rattrapage doit s'y arrêter.
  it("s'arrête au premier segment manuel rencontré", () => {
    const { result } = runner();
    act(() =>
      result.current.start(
        [seg(SegmentKind.EFFORT, 10, 0), seg(SegmentKind.MANUAL, 0, 1), seg(SegmentKind.REST, 60)],
        context,
      ),
    );

    advance(3_600_000);

    expect(result.current.index).toBe(1);
    expect(result.current.awaiting).toBe(true);
  });

  it("clôt le déroulé quand le dernier segment est passé pendant la veille", () => {
    const { result } = runner();
    act(() => result.current.start([seg(SegmentKind.EFFORT, 10, 0)], context));
    advance(3_600_000);
    expect(result.current.active).toBe(false);
  });
});

describe("useSegmentRunner — pause, saut et rallonge", () => {
  const two = [seg(SegmentKind.EFFORT, 30, 0), seg(SegmentKind.REST, 60)];

  it("fige le décompte en pause et le reprend là où il en était", () => {
    const { result } = runner();
    act(() => result.current.start(two, context));
    advance(10_000);
    act(() => result.current.pause());

    expect(result.current.isPaused).toBe(true);
    // `deadline` est ce que suit la notification programmée : la laisser en pause la ferait sonner.
    expect(result.current.deadline).toBeNull();

    advance(3_600_000);
    expect(result.current.index).toBe(0);

    act(() => result.current.resume());
    expect(result.current.isPaused).toBe(false);
    advance(20_000);
    expect(result.current.index).toBe(1);
  });

  /** Un segment écourté n'est pas fait : sauter ne coche rien. */
  it("saute sans cocher l'unité", () => {
    const { result, onUnitDone } = runner();
    act(() => result.current.start(two, context));
    act(() => result.current.skip());
    expect(result.current.index).toBe(1);
    expect(onUnitDone).not.toHaveBeenCalled();
  });

  it("clôt le déroulé quand on saute le dernier segment", () => {
    const { result } = runner();
    act(() => result.current.start([seg(SegmentKind.EFFORT, 30, 0)], context));
    act(() => result.current.skip());
    expect(result.current.active).toBe(false);
  });

  it("repousse l'échéance quand on rallonge le segment", () => {
    const { result } = runner();
    act(() => result.current.start(two, context));
    advance(25_000);
    act(() => result.current.add(30));
    advance(5_000);
    expect(result.current.index).toBe(0);
  });

  it("remet tout à zéro sur un arrêt", () => {
    const { result } = runner();
    act(() => result.current.start(two, context));
    act(() => result.current.stop());
    expect(result.current.active).toBe(false);
    expect(result.current.index).toBe(0);
    expect(result.current.remaining).toBe(0);
  });
});
