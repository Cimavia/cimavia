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
import { renderWithProviders } from "../../../../test/render";

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
    structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: null },
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

describe("TrackingList — les cases", () => {
  /** La granularité vient du BANDEAU : « ×3 séries » n'a qu'une ligne de grille mais trois cases. */
  it("ouvre une case par unité du bandeau, pas par ligne de grille", () => {
    const { getAllByRole } = renderWithProviders(<TrackingList block={seriesBlock()} {...props} />);

    expect(getAllByRole("button")).toHaveLength(3);
  });

  /**
   * Le rappel du dosage vit dans le `title` et non dans le texte : la case est étroite, et son
   * libellé est déjà « série 1 ». `unitValues` saute les absences en amont — une case n'a pas la
   * place d'aligner des tirets.
   */
  it("rappelle le dosage de la ligne en infobulle, sans les colonnes vides", () => {
    const { getAllByRole } = renderWithProviders(<TrackingList block={seriesBlock()} {...props} />);

    expect(getAllByRole("button")[0]?.title).toBe(`6 ${REPS_UNIT} · 12 ${LOAD_UNIT}`);
  });

  it("ne met pas de tiret en infobulle : une colonne vide y est sautée, pas dite", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: 6 } }]);
    const { getAllByRole } = renderWithProviders(<TrackingList block={block} {...props} />);

    expect(getAllByRole("button")[0]?.title).toBe(`6 ${REPS_UNIT}`);
  });

  it("remonte l'index coché, et lui seul", async () => {
    const onToggle = vi.fn();
    const { getAllByRole, user } = renderWithProviders(
      <TrackingList block={seriesBlock()} {...props} onToggle={onToggle} />,
    );

    const second = getAllByRole("button")[1];
    if (second == null) throw new Error("deuxième case absente");
    await user.click(second);

    expect(onToggle).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("porte l'état coché sur la case elle-même, pour le lecteur d'écran", () => {
    const { getAllByRole } = renderWithProviders(
      <TrackingList block={seriesBlock()} {...props} state={{ checked: [0, 2] }} />,
    );

    const états = getAllByRole("button").map((box) => box.getAttribute("aria-pressed"));
    expect(états).toEqual(["true", "false", "true"]);
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
    const { container } = renderWithProviders(<TrackingList block={libre} {...props} />);

    expect(container.textContent).toBe("");
  });
});

describe("TrackingList — le compteur d'un AMRAP", () => {
  /** L'AMRAP se COMPTE : son objectif est indicatif, et le compteur n'a pas de plafond. */
  it("remplace les cases par un compteur", () => {
    const { container } = renderWithProviders(<TrackingList block={amrapBlock()} {...props} />);

    expect(container.textContent).toContain("plan.tracking.rounds");
    expect(container.textContent).toContain("0");
  });

  it("incrémente sans plafond", async () => {
    const onRounds = vi.fn();
    const { getByRole, user } = renderWithProviders(
      <TrackingList block={amrapBlock()} {...props} state={{ rounds: 12 }} onRounds={onRounds} />,
    );

    await user.click(getByRole("button", { name: "+" }));

    expect(onRounds).toHaveBeenCalledExactlyOnceWith(13);
  });

  /** Un tour négatif n'existe pas : le bouton se ferme plutôt que de rendre -1. */
  it("ferme le retrait à zéro", () => {
    const { getByRole } = renderWithProviders(
      <TrackingList block={amrapBlock()} {...props} state={{ rounds: 0 }} />,
    );

    expect(getByRole("button", { name: "−" })).toHaveProperty("disabled", true);
  });
});
