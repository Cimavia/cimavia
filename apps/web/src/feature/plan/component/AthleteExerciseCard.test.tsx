import {
  BlockType,
  DocumentUsage,
  type ExerciseDocumentDto,
  exerciseBlockSchema,
  MetricKey,
  MetricSource,
  MetricUnit,
  RichBlockType,
  type ScheduledSessionExerciseDto,
} from "@cmv/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { AthleteExerciseCard } from "./AthleteExerciseCard";

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

const document = (over: Partial<ExerciseDocumentDto>): ExerciseDocumentDto =>
  ({
    id: "doc-1",
    type: "PDF",
    usage: DocumentUsage.ATTACHMENT,
    url: "https://s3.test/doc-1",
    fileName: "Plan.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-09-01T08:00:00.000Z",
    ...over,
  }) as ExerciseDocumentDto;

const exercise = (over: Partial<ScheduledSessionExerciseDto> = {}): ScheduledSessionExerciseDto =>
  ({
    id: "sx-1",
    sourceExerciseId: "ex-1",
    title: "Traction",
    description: null,
    instructions: [{ type: RichBlockType.PARAGRAPH, content: [{ text: "Gainé." }] }],
    blocks: [series],
    customMetrics: [],
    tracking: null,
    tags: [],
    note: null,
    baseline: [],
    adjustments: [],
    position: 0,
    documents: [],
    ...over,
  }) as ScheduledSessionExerciseDto;

function setup(over: Partial<ScheduledSessionExerciseDto> = {}, tracking = exercise().tracking) {
  const onToggleUnit = vi.fn();
  const onRounds = vi.fn();
  const view = renderWithProviders(
    <AthleteExerciseCard
      exercise={exercise(over)}
      position={1}
      tracking={tracking}
      onToggleUnit={onToggleUnit}
      onRounds={onRounds}
    />,
  );
  return { ...view, onToggleUnit, onRounds };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AthleteExerciseCard — le suivi", () => {
  // Non suivi n'est pas « 0 sur 3 » : pas de pastille, jamais de relance.
  it("se tait tant que rien n'est coché", () => {
    const { queryByText } = setup();

    expect(queryByText(/plan\.tracking\.count\./)).toBeNull();
  });

  it("pose une pastille dès la première case cochée", () => {
    const { getByText } = setup({}, { blk_1: { checked: [0] } });

    expect(getByText(/plan\.tracking\.count\./)).toBeInTheDocument();
  });

  it("passe la pastille au vert quand tout est coché", () => {
    const { getByText } = setup({}, { blk_1: { checked: [0, 1, 2] } });

    expect(getByText(/plan\.tracking\.count\./)).toHaveClass("bg-cmv-success-soft");
  });

  it("remonte la case cochée et les tours comptés avec leur bloc", async () => {
    const { user, getAllByRole, getByRole, onToggleUnit, onRounds } = setup({
      blocks: [series, amrap],
    });

    await user.click(getAllByRole("button", { pressed: false })[1] as HTMLElement);
    await user.click(getByRole("button", { name: "+" }));

    expect(onToggleUnit).toHaveBeenCalledWith("blk_1", 1);
    expect(onRounds).toHaveBeenCalledWith("blk_2", 1);
  });
});

describe("AthleteExerciseCard — la consigne", () => {
  // Le web est l'écran de lecture : la consigne est dépliée, l'athlète replie s'il veut.
  it("se lit dépliée, et se replie", async () => {
    const { user, getByRole, queryByText } = setup();
    expect(queryByText("Gainé.")).toBeInTheDocument();

    await user.click(getByRole("button", { name: "plan.athlete.hideInstructions" }));

    expect(queryByText("Gainé.")).toBeNull();
    expect(getByRole("button", { name: "plan.athlete.showInstructions" })).toBeInTheDocument();
  });

  it("n'offre aucun lien vers une consigne absente", () => {
    const { queryByRole } = setup({ instructions: null });

    expect(queryByRole("button", { name: "plan.athlete.hideInstructions" })).toBeNull();
  });

  it("résout ses images parmi les documents, et tait celle qui n'y est plus", () => {
    const { getAllByRole } = setup({
      instructions: [
        { type: RichBlockType.IMAGE, mediaId: "img-1", caption: "Prise" },
        { type: RichBlockType.IMAGE, mediaId: "img-gone", caption: "Disparue" },
      ],
      documents: [
        document({ id: "img-1", usage: DocumentUsage.INSTRUCTION, url: "https://s3.test/img-1" }),
      ],
    });

    const images = getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://s3.test/img-1");
  });

  it("affiche la note du coach sur l'exercice", () => {
    const { getByText } = setup({ note: "Lent à la descente" });

    expect(getByText("Lent à la descente")).toBeInTheDocument();
  });
});

describe("AthleteExerciseCard — les pièces jointes", () => {
  it("n'offre que les pièces jointes, pas les images de consigne", () => {
    const { getByRole, queryByRole } = setup({
      documents: [
        document({ id: "doc-1" }),
        document({ id: "img-1", usage: DocumentUsage.INSTRUCTION, fileName: "Schéma.png" }),
      ],
    });

    expect(getByRole("button", { name: "Plan.pdf" })).toBeInTheDocument();
    expect(queryByRole("button", { name: "Schéma.png" })).toBeNull();
  });

  it("ouvre la pièce dans un onglet détaché, nommée même sans nom de fichier", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { user, getByRole } = setup({ documents: [document({ fileName: null })] });

    await user.click(getByRole("button", { name: "plan.athlete.document" }));

    expect(open).toHaveBeenCalledWith("https://s3.test/doc-1", "_blank", "noopener");
  });
});
