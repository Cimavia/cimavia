import {
  BlockType,
  type ExerciseBlock,
  exerciseBlockSchema,
  METRIC_UNIT_LABEL_KEY,
  MetricKey,
  MetricSource,
  MetricUnit,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { TrackingList } from "@/feature/plan/component/TrackingList";
import { press, renderRn } from "@/test/render";

const column = (id: string, key: MetricKey, unit: MetricUnit) =>
  ({ id, source: MetricSource.CATALOG, key, unit, label: null, collapsed: false }) as const;

const reps = column("col_reps", MetricKey.REPETITIONS, MetricUnit.REPS);
const load = column("col_load", MetricKey.LOAD, MetricUnit.KILOGRAMS_ADDED);

const REPS_UNIT = METRIC_UNIT_LABEL_KEY[MetricUnit.REPS];
const LOAD_UNIT = METRIC_UNIT_LABEL_KEY[MetricUnit.KILOGRAMS_ADDED];

const seriesBlock = (
  rows: ExerciseBlock["rows"] = [{ id: "r1", values: { col_reps: 6, col_load: 12 } }],
  setCount = 3,
): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_1",
    label: null,
    structure: { type: BlockType.SERIES, setCount, restBetweenSetsSeconds: null },
    metrics: [reps, load],
    rows,
  });

const amrapBlock = (): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_2",
    label: null,
    structure: { type: BlockType.AMRAP, totalDurationSeconds: 600, targetRounds: null },
    metrics: [reps],
    rows: [{ id: "r1", values: { col_reps: 6 } }],
  });

const props = { customMetrics: [], state: undefined, onToggle: vi.fn(), onRounds: vi.fn() };

function boxes(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[role="checkbox"]'));
}

describe("TrackingList — les cases", () => {
  /**
   * La granularité n'est PAS celle du coach : « ×3 séries » n'a qu'une ligne de grille mais trois
   * cases. C'est le bandeau qui compte, pas la grille.
   */
  it("ouvre une case par unité du bandeau, pas par ligne de grille", () => {
    const { container } = renderRn(<TrackingList block={seriesBlock()} {...props} />);

    expect(boxes(container)).toHaveLength(3);
  });

  it("rappelle le dosage de la ligne sur chaque case, unités comprises", () => {
    const { container } = renderRn(<TrackingList block={seriesBlock()} {...props} />);

    expect(container.textContent).toContain(`6 ${REPS_UNIT} · 12 ${LOAD_UNIT}`);
  });

  /**
   * `unitValues` saute les absences EN AMONT, et le dit dans sa JSDoc : une case n'a pas la place
   * d'aligner des tirets. Le rappel d'une case n'est donc pas la phrase de dosage — c'est le seul
   * endroit du mobile où une colonne vide se tait, et c'est voulu.
   */
  it("ne met pas de tiret sur une case : une colonne vide y est sautée, pas dite", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: 6 } }]);
    const { container } = renderRn(<TrackingList block={block} {...props} />);

    expect(container.textContent).toContain(`6 ${REPS_UNIT}`);
    expect(container.textContent).not.toContain("—");
    expect(container.textContent).not.toContain("·");
  });

  it("remonte l'index coché, et lui seul", () => {
    const onToggle = vi.fn();
    const { container } = renderRn(
      <TrackingList block={seriesBlock()} {...props} onToggle={onToggle} />,
    );

    const [, second] = boxes(container);
    if (second == null) throw new Error("deuxième case absente");
    press(second);

    expect(onToggle).toHaveBeenCalledExactlyOnceWith(1);
  });

  /**
   * On affirme sur le « ✓ », que l'athlète VOIT, et non sur `aria-checked` : `accessibilityState`
   * est la prop React Native héritée, que `react-native-web` ne mappe plus sur un attribut ARIA.
   * Elle reste honorée par le rendu NATIF — le harnais n'en voit simplement rien (cf. #137).
   */
  it("coche les unités faites, et elles seules", () => {
    const { container } = renderRn(
      <TrackingList block={seriesBlock()} {...props} state={{ checked: [0, 2] }} />,
    );

    const cochées = boxes(container).map((box) => box.textContent?.includes("✓") ?? false);
    expect(cochées).toEqual([true, false, true]);
  });

  /** Rien à cocher, rien à afficher : une case « 0 sur 0 » ne dirait rien. */
  it("ne rend rien quand le bloc n'a aucune unité à suivre", () => {
    const libre = exerciseBlockSchema.parse({
      id: "blk_3",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [reps],
      rows: [],
    });
    const { container } = renderRn(<TrackingList block={libre} {...props} />);

    expect(boxes(container)).toHaveLength(0);
    expect(container.textContent).toBe("");
  });
});

describe("TrackingList — le compteur d'un AMRAP", () => {
  /** L'AMRAP se COMPTE : son objectif est indicatif, et le compteur n'a pas de plafond. */
  it("remplace les cases par un compteur", () => {
    const { container } = renderRn(<TrackingList block={amrapBlock()} {...props} />);

    expect(boxes(container)).toHaveLength(0);
    expect(container.textContent).toContain("0");
  });

  it("incrémente sans plafond", () => {
    const onRounds = vi.fn();
    const { getByLabelText } = renderRn(
      <TrackingList block={amrapBlock()} {...props} state={{ rounds: 12 }} onRounds={onRounds} />,
    );

    press(getByLabelText("plan.tracking.roundsPlus"));

    expect(onRounds).toHaveBeenCalledExactlyOnceWith(13);
  });

  /** Un tour négatif n'existe pas : le bouton se ferme plutôt que de rendre -1. */
  it("ferme le retrait à zéro", () => {
    const { getByLabelText } = renderRn(
      <TrackingList block={amrapBlock()} {...props} state={{ rounds: 0 }} />,
    );

    expect(getByLabelText("plan.tracking.roundsMinus")).toHaveProperty("ariaDisabled", "true");
  });
});
