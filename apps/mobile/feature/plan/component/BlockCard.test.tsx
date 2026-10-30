import { BlockTallyState, readScheduledBlocks } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { block, blockSession, REPS, repsGrid } from "@/test/block-session";
import { press, renderRn } from "@/test/render";

// La consigne et les documents ont leur test (`ExerciseCard`) : ici, on vérifie qu'ils sont posés.
vi.mock("@/feature/plan/component/ExerciseExtras", () => ({
  ExerciseExtras: ({ exercise }: Readonly<{ exercise: { id: string } }>) => (
    <span>{`extras ${exercise.id}`}</span>
  ),
}));

const { BlockCard } = await import("./BlockCard");

function readOf(session = blockSession(), index = 0) {
  const read = readScheduledBlocks(session)[index];
  if (read == null) throw new Error("bloc absent de la fixture");
  return read;
}

describe("BlockCard", () => {
  it("lit le bloc : son numéro, sa structure, ses exercices sous leur code", () => {
    renderRn(
      <BlockCard read={readOf(blockSession(), 2)} planId="p-1" sessionId="s-1" tally={null} />,
    );

    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Tabata")).toBeTruthy();
    expect(screen.getByText(/2\.1/)).toBeTruthy();
    expect(screen.getByText(/2\.2/)).toBeTruthy();
    expect(screen.getByText("extras sx-2")).toBeTruthy();
  });

  it("lit un bloc à libellé par son libellé, ses exercices sans code", () => {
    renderRn(
      <BlockCard read={readOf(blockSession(), 1)} planId="p-1" sessionId="s-1" tally={null} />,
    );

    expect(screen.getByText("Finisher")).toBeTruthy();
    expect(screen.queryByText(/1\.1/)).toBeNull();
  });

  it("montre le décompte quand il y en a un, rien sinon", () => {
    const tally = { state: BlockTallyState.DONE, label: { key: "block.tally.done", params: {} } };
    const { rerender } = renderRn(
      <BlockCard read={readOf()} planId="p-1" sessionId="s-1" tally={tally} />,
    );
    expect(screen.getByText("block.tally.done")).toBeTruthy();

    rerender(<BlockCard read={readOf()} planId="p-1" sessionId="s-1" tally={null} />);
    expect(screen.queryByText("block.tally.done")).toBeNull();
  });

  it("s'ouvre par son bouton « Ouvrir » quand l'écran le permet", () => {
    const onOpen = vi.fn();
    renderRn(
      <BlockCard read={readOf()} planId="p-1" sessionId="s-1" tally={null} onOpen={onOpen} />,
    );

    press(screen.getByText("plan.blocks.openShort"));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("plan.blocks.open")).toBeTruthy();
  });

  it("lit la consigne du bloc et la note de chaque exercice", () => {
    const session = blockSession({
      blocks: [block({ id: "blk-1", instructions: "Tempo lent", exercises: [["sx-1", "a1"]] })],
    });
    const read = readOf(session);
    const [first] = read.exercises;
    if (first == null) throw new Error("exercice absent de la fixture");
    renderRn(
      <BlockCard
        read={{ ...read, exercises: [{ ...first, row: { ...first.row, note: "Genoux dehors" } }] }}
        planId="p-1"
        sessionId="s-1"
        tally={null}
      />,
    );

    expect(screen.getByText("Tempo lent")).toBeTruthy();
    expect(screen.getByText("Genoux dehors")).toBeTruthy();
  });

  it("s'ouvre aussi par son libellé, quand il n'a pas de numéro", () => {
    const onOpen = vi.fn();
    renderRn(
      <BlockCard
        read={readOf(blockSession(), 1)}
        planId="p-1"
        sessionId="s-1"
        tally={null}
        onOpen={onOpen}
      />,
    );

    press(screen.getByLabelText("plan.blocks.open"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("n'offre aucune ouverture sur l'écran du bloc lui-même", () => {
    renderRn(<BlockCard read={readOf()} planId="p-1" sessionId="s-1" tally={null} />);
    expect(screen.queryByLabelText("plan.blocks.open")).toBeNull();
  });

  it("dit l'enchaînement en tête, sauf quand l'écran le dit ailleurs", () => {
    const read = readOf(blockSession(), 2);
    const { rerender } = renderRn(
      <BlockCard read={read} planId="p-1" sessionId="s-1" tally={null} />,
    );
    expect(screen.getByText(/block\.flow/)).toBeTruthy();

    rerender(<BlockCard read={read} planId="p-1" sessionId="s-1" tally={null} showFlow={false} />);
    expect(screen.queryByText(/block\.flow/)).toBeNull();
  });
});

describe("GridValues, dans la carte", () => {
  const session = (grid: ReturnType<typeof repsGrid>) =>
    blockSession({ blocks: [block({ id: "blk-1", exercises: [["sx-1", "a1", grid]] })] });

  it("ne montre aucune grille sans valeur", () => {
    renderRn(
      <BlockCard read={readOf(session(repsGrid(null)))} planId="p" sessionId="s" tally={null} />,
    );
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText(/block\.grid/)).toBeNull();
  });

  it("dit une phrase quand toutes les lignes se ressemblent", () => {
    renderRn(
      <BlockCard read={readOf(session(repsGrid(8, 8)))} planId="p" sessionId="s" tally={null} />,
    );
    expect(screen.getByText(/block\.grid\.eachSet/)).toBeTruthy();
  });

  it("dispose un tableau quand les lignes diffèrent, une cellule vide valant « — »", () => {
    renderRn(
      <BlockCard read={readOf(session(repsGrid(8, null)))} planId="p" sessionId="s" tally={null} />,
    );
    expect(screen.getAllByText("block.grid.set")).toHaveLength(2);
    expect(screen.getByText("—")).toBeTruthy();
    // L'en-tête dit « Répétitions » : la cellule n'écrit que le nombre.
    expect(screen.getByText("8")).toBeTruthy();
  });

  it("passe en cartes quand les colonnes ne tiennent plus sur l'écran", () => {
    const metrics = [1, 2, 3, 4, 5, 6].map((index) => ({ ...REPS, id: `col_${index}` }));
    const row = (value: number) => ({
      id: `row_${value}`,
      values: Object.fromEntries(metrics.map((metric) => [metric.id, value])),
    });
    renderRn(
      <BlockCard
        read={readOf(session({ metrics, rows: [row(8), row(6)] }))}
        planId="p"
        sessionId="s"
        tally={null}
      />,
    );

    // Une carte par ligne, son libellé en tête : aucune en-tête de colonnes.
    expect(screen.getAllByText("block.grid.set")).toHaveLength(2);
    expect(screen.queryByText("—")).toBeNull();
  });
});
