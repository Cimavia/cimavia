import {
  type BlockSegment,
  BlockType,
  type ExerciseBlock,
  exerciseBlockSchema,
  METRIC_UNIT_LABEL_KEY,
  MetricKey,
  MetricSource,
  MetricUnit,
  SegmentKind,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { RunnerBody } from "@/feature/plan/component/RunnerBody";
import { renderRn } from "@/test/render";

const column = (id: string, key: MetricKey, unit: MetricUnit) =>
  ({ id, source: MetricSource.CATALOG, key, unit, label: null, collapsed: false }) as const;

const reps = column("col_reps", MetricKey.REPETITIONS, MetricUnit.REPS);
const load = column("col_load", MetricKey.LOAD, MetricUnit.KILOGRAMS_ADDED);

const REPS_UNIT = METRIC_UNIT_LABEL_KEY[MetricUnit.REPS];
const LOAD_UNIT = METRIC_UNIT_LABEL_KEY[MetricUnit.KILOGRAMS_ADDED];

const seriesBlock = (
  rows: ExerciseBlock["rows"] = [{ id: "r1", values: { col_reps: 6, col_load: 12 } }],
): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_1",
    label: null,
    structure: { type: BlockType.SERIES, setCount: 2, restBetweenSetsSeconds: 60 },
    metrics: [reps, load],
    rows,
  });

const emomBlock = (): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_2",
    label: null,
    structure: { type: BlockType.EMOM, totalDurationSeconds: 180, intervalSeconds: 60 },
    metrics: [reps],
    rows: [{ id: "r1", values: { col_reps: 6 } }],
  });

const amrapBlock = (targetRounds: number | null = null): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_3",
    label: null,
    structure: { type: BlockType.AMRAP, totalDurationSeconds: 600, targetRounds },
    metrics: [reps],
    rows: [{ id: "r1", values: { col_reps: 6 } }],
  });

const segment = (over: Partial<BlockSegment> = {}): BlockSegment => ({
  kind: SegmentKind.EFFORT,
  seconds: 45,
  unitIndex: 0,
  rowId: "r1",
  ...over,
});

const base = {
  customMetrics: [],
  remaining: 30,
  total: 45,
  totalRemaining: 150,
  checked: [],
  rounds: 0,
};

describe("RunnerBody — l'effort minuté", () => {
  it("montre le temps restant, et le dosage de la ligne jouée", () => {
    const { container } = renderRn(
      <RunnerBody block={seriesBlock()} {...base} current={segment()} />,
    );

    expect(container.textContent).toContain("30 s");
    expect(container.textContent).toContain(`6 ${REPS_UNIT} · 12 ${LOAD_UNIT}`);
  });

  /**
   * La bannière tient sur UNE ligne centrée, et l'athlète a les yeux dessus entre deux séries : le
   * filtre est posé ici, explicitement, plutôt que par un formateur qui rendrait du vide en
   * silence. C'est le seul endroit du déroulé où une colonne absente se tait.
   */
  it("saute les colonnes vides plutôt que d'aligner des tirets", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: 6 } }]);
    const { container } = renderRn(<RunnerBody block={block} {...base} current={segment()} />);

    expect(container.textContent).toContain(`6 ${REPS_UNIT}`);
    expect(container.textContent).not.toContain("—");
    expect(container.textContent).not.toContain("·");
  });

  it("n'affiche aucune bannière quand la ligne entière est vide", () => {
    const block = seriesBlock([{ id: "r1", values: {} }]);
    const { container } = renderRn(<RunnerBody block={block} {...base} current={segment()} />);

    expect(container.textContent).not.toContain(REPS_UNIT);
  });

  it("n'affiche aucune bannière quand le segment cite une ligne disparue", () => {
    const { container } = renderRn(
      <RunnerBody block={seriesBlock()} {...base} current={segment({ rowId: "fantôme" })} />,
    );

    expect(container.textContent).not.toContain(REPS_UNIT);
  });

  /** `rowId` nul : le segment ne cite pas de ligne, on retombe sur celle de son unité. */
  it("retombe sur la ligne de l'unité quand le segment n'en cite aucune", () => {
    const { container } = renderRn(
      <RunnerBody block={seriesBlock()} {...base} current={segment({ rowId: null })} />,
    );

    expect(container.textContent).toContain(`6 ${REPS_UNIT}`);
  });
});

describe("RunnerBody — le segment manuel", () => {
  /**
   * « 8 tractions » dure ce qu'il dure : le déroulé s'arrête et attend un geste. Un chrono ici
   * ferait tourner le temps pendant que l'athlète grimpe encore.
   */
  it("attend un geste au lieu de décompter", () => {
    const { container } = renderRn(
      <RunnerBody
        block={seriesBlock()}
        {...base}
        current={segment({ kind: SegmentKind.MANUAL, seconds: 0 })}
      />,
    );

    expect(container.textContent).toContain("plan.timer.awaiting");
    expect(container.textContent).not.toContain("30 s");
    expect(container.textContent).toContain(`6 ${REPS_UNIT}`);
  });
});

describe("RunnerBody — l'EMOM", () => {
  const current = segment({ kind: SegmentKind.INTERVAL, seconds: 60, unitIndex: 1 });

  /** L'athlète cherche « il me reste combien avant le prochain top », pas « intervalle 37 s ». */
  it("annonce le temps AVANT LE PROCHAIN TOP", () => {
    const { container } = renderRn(<RunnerBody block={emomBlock()} {...base} current={current} />);

    expect(container.textContent).toContain("plan.timer.beforeNextTop");
  });

  /** Une frise plutôt qu'un compteur nu : l'athlète voit d'un coup d'œil s'il a sauté un top. */
  it("déroule un rond par top du bloc", () => {
    const { container } = renderRn(
      <RunnerBody block={emomBlock()} {...base} current={current} checked={[0]} />,
    );

    // 180 s d'EMOM par intervalles de 60 s : trois tops, numérotés 1 à 3.
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("3");
    expect(container.textContent).not.toContain("4");
  });
});

describe("RunnerBody — l'AMRAP", () => {
  const current = segment({ kind: SegmentKind.COUNTDOWN, seconds: 600, unitIndex: null });

  it("compte les tours faits au lieu de les cocher", () => {
    const { container } = renderRn(
      <RunnerBody block={amrapBlock()} {...base} current={current} rounds={7} />,
    );

    expect(container.textContent).toContain("7");
    expect(container.textContent).toContain("plan.tracking.rounds");
  });

  /** L'objectif est INDICATIF : il s'affiche quand le coach en a posé un, et se tait sinon. */
  it("tait l'objectif quand le coach n'en a pas fixé", () => {
    const { container } = renderRn(
      <RunnerBody block={amrapBlock()} {...base} current={current} rounds={7} />,
    );

    expect(container.textContent).not.toContain("plan.timer.targetRounds");
  });

  it("montre l'objectif quand il existe", () => {
    const { container } = renderRn(
      <RunnerBody block={amrapBlock(10)} {...base} current={current} rounds={7} />,
    );

    expect(container.textContent).toContain("plan.timer.targetRounds");
  });
});
