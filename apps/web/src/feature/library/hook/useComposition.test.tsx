import type { ExerciseDto } from "@cmv/shared";
import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { describeReorder, dragOnto } from "../../../../test/reorder";
import { CompositionEditor } from "../component/CompositionEditor";
import { type CompositionRow, useComposition } from "./useComposition";

const PREFIX = "plan.session";

const initial = (): CompositionRow[] => [
  { key: "a", title: "Tractions", tags: [], note: "" },
  { key: "b", title: "Gainage", tags: [], note: "" },
  { key: "c", title: "Suspensions", tags: [], note: "" },
];

const toRow = (exercise: ExerciseDto) => ({
  title: exercise.title,
  tags: exercise.tags,
  note: "",
});

const exercise = { id: "ex-9", title: "Planche", tags: ["gainage"] } as unknown as ExerciseDto;

/**
 * Le hook branché sur l'éditeur qui le consomme en production : les déplacements s'éprouvent par
 * le GESTE (flèche, poignée au clavier, glisser) et se lisent dans l'ordre AFFICHÉ. C'est ce qui
 * gardera #360 quand il fusionnera les sept copies du déplacement : le test ne connaît pas la
 * fonction interne, seulement ce que le coach voit.
 */
function Host() {
  const composition = useComposition(initial, toRow);
  return (
    <CompositionEditor
      items={composition.items}
      labelPrefix={PREFIX}
      onMove={composition.moveItem}
      onMoveTo={composition.moveTo}
      onRemove={composition.removeItem}
      onNoteChange={composition.setNote}
    />
  );
}

function mount() {
  const view = renderWithProviders(<Host />);
  // `getAllByText` rend les nœuds dans l'ordre du document : c'est l'ordre que le coach lit.
  const order = () =>
    view.getAllByText(/^(Tractions|Gainage|Suspensions)$/).map((node) => node.textContent);
  const handle = (rank: number) =>
    view.getByRole("button", { name: `${PREFIX}.moveExercise ${rank}` });
  return { ...view, order, handle };
}

describe("useComposition, par le geste", () => {
  describeReorder(["Tractions", "Gainage", "Suspensions"], () => {
    const { user, getAllByRole, order, handle } = mount();
    return {
      order,
      moveUp: (rank) =>
        user.click(getAllByRole("button", { name: `${PREFIX}.moveUp` })[rank - 1] as HTMLElement),
      moveDown: (rank) =>
        user.click(getAllByRole("button", { name: `${PREFIX}.moveDown` })[rank - 1] as HTMLElement),
      drag: (from, to) => dragOnto(handle(from), handle(to)),
    };
  });

  // Les flèches se ferment en bord de liste, pas la poignée : c'est le hook qui borne le clavier.
  it("ne monte pas au-dessus de la première ligne, depuis la poignée", async () => {
    const { user, order, handle } = mount();

    handle(1).focus();
    await user.keyboard("{ArrowUp}");

    expect(order()).toEqual(["Tractions", "Gainage", "Suspensions"]);
  });

  it("ne descend pas sous la dernière ligne, depuis la poignée", async () => {
    const { user, order, handle } = mount();

    handle(3).focus();
    await user.keyboard("{ArrowDown}");

    expect(order()).toEqual(["Tractions", "Gainage", "Suspensions"]);
  });

  it("retire la ligne désignée, et elle seule", async () => {
    const { user, getAllByRole, queryByText, order } = mount();

    await user.click(getAllByRole("button", { name: `${PREFIX}.remove` })[1] as HTMLElement);

    expect(queryByText("Gainage")).not.toBeInTheDocument();
    expect(order()).toEqual(["Tractions", "Suspensions"]);
  });

  it("écrit la note sur sa ligne, sans toucher aux autres", () => {
    const { getAllByLabelText } = mount();
    const notes = () => getAllByLabelText(`${PREFIX}.noteLabel`) as HTMLInputElement[];

    fireEvent.change(notes()[1] as HTMLInputElement, { target: { value: "Lesté" } });

    expect(notes().map((input) => input.value)).toEqual(["", "Lesté", ""]);
  });
});

describe("useComposition.addExercise", () => {
  it("ajoute l'exercice en fin de liste, construit par la feature", () => {
    const { result } = renderHook(() => useComposition(initial, toRow));

    act(() => result.current.addExercise(exercise));

    expect(result.current.items).toHaveLength(4);
    expect(result.current.items[3]).toMatchObject({
      title: "Planche",
      tags: ["gainage"],
      note: "",
    });
  });

  // Un même exercice peut figurer deux fois dans une séance : l'identité de la ligne est sa clé.
  it("donne une clé propre à chaque ajout, même du même exercice", () => {
    const { result } = renderHook(() => useComposition<CompositionRow>(() => [], toRow));

    act(() => {
      result.current.addExercise(exercise);
      result.current.addExercise(exercise);
    });

    const [first, second] = result.current.items;
    expect(first?.key).toEqual(expect.any(String));
    expect(first?.key).not.toBe(second?.key);
  });

  it("ne retire qu'une des deux copies du même exercice", () => {
    const { result } = renderHook(() => useComposition<CompositionRow>(() => [], toRow));
    act(() => {
      result.current.addExercise(exercise);
      result.current.addExercise(exercise);
    });
    const kept = result.current.items[1]?.key;

    act(() => result.current.removeItem(result.current.items[0]?.key as string));

    expect(result.current.items.map((item) => item.key)).toEqual([kept]);
  });
});
