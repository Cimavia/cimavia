import {
  BlockType,
  exerciseBlockSchema,
  MetricKey,
  MetricSource,
  MetricUnit,
  type ScheduledSessionExerciseDto,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { FeedbackTrackingSection } from "./FeedbackTrackingSection";

const reps = {
  id: "col_reps",
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
  label: null,
  collapsed: false,
} as const;

const series = exerciseBlockSchema.parse({
  id: "blk_1",
  label: null,
  structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: null },
  metrics: [reps],
  rows: [{ id: "r1", values: { col_reps: 6 } }],
});

const amrap = exerciseBlockSchema.parse({
  id: "blk_2",
  label: null,
  structure: { type: BlockType.AMRAP, totalDurationSeconds: 600, targetRounds: null },
  metrics: [reps],
  rows: [{ id: "r1", values: { col_reps: 6 } }],
});

// Un bloc libre sans ligne n'a aucune étape à cocher.
const empty = { ...series, id: "blk_3", structure: { type: BlockType.FREE }, rows: [] } as never;

const exercise = (id: string, title: string, blocks: unknown[]) =>
  ({ id, title, blocks, customMetrics: [] }) as unknown as ScheduledSessionExerciseDto;

const TRACTION = exercise("sx-1", "Traction", [series]);
const CIRCUIT = exercise("sx-2", "Circuit", [amrap]);
const MOBILITE = exercise("sx-3", "Mobilité", [empty]);

const EDIT = "feedback.tracking.edit";

function mount(tracking: Record<string, unknown> = {}, exercises = [TRACTION, CIRCUIT, MOBILITE]) {
  const onToggleUnit = vi.fn();
  const onRounds = vi.fn();
  const view = renderWithProviders(
    <FeedbackTrackingSection
      exercises={exercises}
      tracking={tracking as never}
      onToggleUnit={onToggleUnit}
      onRounds={onRounds}
    />,
  );
  return { ...view, onToggleUnit, onRounds };
}

describe("FeedbackTrackingSection", () => {
  // Un récapitulatif vide n'apprend rien : la section se tait.
  it("ne rend rien quand aucun exercice n'a d'unité à cocher", () => {
    const { container } = mount({}, [MOBILITE]);

    // Le fournisseur de toasts rend sa propre zone : c'est la section qu'on cherche.
    expect(container.querySelector("section")).toBeNull();
  });

  it("ne rappelle que les exercices qui se décomptent", () => {
    const { getByText, queryByText } = mount();

    expect(getByText("Traction")).toBeInTheDocument();
    expect(getByText("Circuit")).toBeInTheDocument();
    expect(queryByText("Mobilité")).toBeNull();
  });

  // Rien coché n'est pas « rien fait » : le terme nomme ce qui manque, en gris, sans reproche.
  it("dit « pas de décompte » en gris sur un exercice jamais coché", () => {
    const { getAllByText } = mount();

    const untracked = getAllByText("feedback.tracking.untracked");
    expect(untracked).toHaveLength(2);
    expect(untracked[0]).toHaveClass("text-cmv-text-lo");
  });

  it("colore le décompte achevé en succès, l'entamé en accent", () => {
    const done = mount({ "sx-1": { blk_1: { checked: [0, 1, 2] } } }, [TRACTION]);
    expect(done.getByText("plan.tracking.count.SET")).toHaveClass("text-cmv-success");
    done.unmount();

    const partial = mount({ "sx-1": { blk_1: { checked: [0] } } }, [TRACTION]);
    expect(partial.getByText("plan.tracking.count.SET")).toHaveClass("text-cmv-accent");
  });

  // Corriger reste à UN clic, exercice par exercice : le crayon rouvre les cases de la séance.
  it("rouvre les cases d'un exercice au crayon, et corrige depuis là", async () => {
    const { user, getAllByRole, queryAllByRole, onToggleUnit } = mount({
      "sx-1": { blk_1: { checked: [0] } },
    });
    const [pencil] = getAllByRole("button", { name: EDIT });

    await user.click(pencil as HTMLElement);
    expect(pencil).toHaveAttribute("aria-expanded", "true");

    const boxes = getAllByRole("button", { pressed: false });
    await user.click(boxes[0] as HTMLElement);
    expect(onToggleUnit).toHaveBeenCalledWith("sx-1", "blk_1", 1);

    await user.click(pencil as HTMLElement);
    expect(pencil).toHaveAttribute("aria-expanded", "false");
    expect(queryAllByRole("button", { pressed: false })).toHaveLength(0);
  });

  // Un seul exercice ouvert à la fois : corriger l'un replie l'autre.
  it("replie l'exercice ouvert quand on en ouvre un autre, et compte ses tours", async () => {
    const { user, getAllByRole, getByRole, onRounds } = mount();
    const [traction, circuit] = getAllByRole("button", { name: EDIT });

    await user.click(traction as HTMLElement);
    await user.click(circuit as HTMLElement);

    expect(traction).toHaveAttribute("aria-expanded", "false");
    await user.click(getByRole("button", { name: "+" }));
    expect(onRounds).toHaveBeenCalledWith("sx-2", "blk_2", 1);
  });
});
