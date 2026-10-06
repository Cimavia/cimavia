import { SESSION_NOTE_MAX_LENGTH } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import type { CompositionRow } from "../hook/useComposition";
import { CompositionEditor } from "./CompositionEditor";

const PREFIX = "plan.session";
const MOVE_UP = `${PREFIX}.moveUp`;
const MOVE_DOWN = `${PREFIX}.moveDown`;
const EMPTY = `${PREFIX}.emptyComposition`;

const handleName = (rank: number) => `${PREFIX}.moveExercise ${rank}`;

const rows: CompositionRow[] = [
  { key: "a", title: "Tractions", tags: [], note: "" },
  { key: "b", title: "Gainage", tags: [], note: "" },
  { key: "c", title: "Suspensions", tags: [], note: "" },
];

function setup(items: readonly CompositionRow[] = rows) {
  const handlers = {
    onMove: vi.fn(),
    onMoveTo: vi.fn(),
    onRemove: vi.fn(),
    onNoteChange: vi.fn(),
  };
  const view = renderWithProviders(<CompositionEditor items={items} {...handlers} />);
  return { ...view, ...handlers };
}

describe("CompositionEditor", () => {
  it("annonce une composition vide plutôt qu'une liste sans ligne", () => {
    const { getByText, queryByRole } = setup([]);

    expect(getByText(EMPTY)).toBeInTheDocument();
    expect(queryByRole("button", { name: handleName(1) })).not.toBeInTheDocument();
  });

  describe("les flèches", () => {
    it("ferment la montée sur le premier exercice et la descente sur le dernier", () => {
      const { getAllByRole } = setup();

      const up = getAllByRole("button", { name: MOVE_UP });
      const down = getAllByRole("button", { name: MOVE_DOWN });

      expect(up[0]).toBeDisabled();
      expect(up[2]).toBeEnabled();
      expect(down[0]).toBeEnabled();
      expect(down[2]).toBeDisabled();
    });

    it("déplacent d'un cran, dans le sens du bouton", async () => {
      const { user, getAllByRole, onMove } = setup();

      await user.click(getAllByRole("button", { name: MOVE_DOWN })[1] as HTMLElement);

      expect(onMove).toHaveBeenCalledWith(1, 1);
    });

    it("montent d'un cran depuis la ligne cliquée", async () => {
      const { user, getAllByRole, onMove } = setup();

      await user.click(getAllByRole("button", { name: MOVE_UP })[2] as HTMLElement);

      expect(onMove).toHaveBeenCalledExactlyOnceWith(2, -1);
    });
  });

  describe("le glisser-déposer", () => {
    // Les événements sont émis sur la POIGNÉE de la ligne visée, pas sur la ligne elle-même :
    // c'est ce qui se passe en vrai, le pointeur survolant toujours un enfant de la ligne.
    it("dépose la ligne glissée sur la ligne survolée", () => {
      const { getByRole, onMoveTo } = setup();

      const target = getByRole("button", { name: handleName(1) });
      fireEvent.dragStart(getByRole("button", { name: handleName(3) }));
      fireEvent.dragOver(target);
      fireEvent.drop(target);

      expect(onMoveTo).toHaveBeenCalledWith(2, 0);
    });

    // Déposer une ligne sur elle-même n'est pas un déplacement : l'appeler quand même ferait
    // enregistrer une modification là où le coach n'a rien changé.
    it("ne déplace rien quand la ligne est déposée sur elle-même", () => {
      const { getByRole, onMoveTo } = setup();

      const handle = getByRole("button", { name: handleName(2) });
      fireEvent.dragStart(handle);
      fireEvent.dragOver(handle);
      fireEvent.drop(handle);

      expect(onMoveTo).not.toHaveBeenCalled();
    });

    // La poignée est un bouton focusable : c'est le chemin clavier du geste, le glisser n'en a pas.
    it("déplace au clavier depuis la poignée", async () => {
      const { user, getByRole, onMove } = setup();

      getByRole("button", { name: handleName(1) }).focus();
      await user.keyboard("{ArrowDown}");

      expect(onMove).toHaveBeenCalledWith(0, 1);
    });
  });

  it("retire la ligne cliquée, désignée par sa clé et non par son rang", async () => {
    const { user, getAllByRole, onRemove } = setup();

    await user.click(getAllByRole("button", { name: `${PREFIX}.remove` })[1] as HTMLElement);

    expect(onRemove).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("borne chaque note à ce que l'API accepte (#319)", () => {
    const { getAllByLabelText } = setup();

    for (const note of getAllByLabelText(`${PREFIX}.noteLabel`)) {
      expect(note).toHaveAttribute("maxLength", String(SESSION_NOTE_MAX_LENGTH));
    }
  });

  it("remonte la note saisie avec la clé de sa ligne", () => {
    const { getAllByLabelText, onNoteChange } = setup();

    fireEvent.change(getAllByLabelText(`${PREFIX}.noteLabel`)[2] as HTMLElement, {
      target: { value: "Lestées 5 kg" },
    });

    expect(onNoteChange).toHaveBeenCalledExactlyOnceWith("c", "Lestées 5 kg");
  });
});

describe("CompositionEditor — détail dépliable", () => {
  const detail = (row: CompositionRow) => ({
    badge: <span>{`badge ${row.title}`}</span>,
    body: <p>{`grille ${row.title}`}</p>,
  });

  it("montre le résumé replié, et le corps seulement une fois la ligne dépliée", async () => {
    const { user, getByRole, getByText, queryByText } = renderWithProviders(
      <CompositionEditor
        items={rows.slice(0, 1)}
        onMove={vi.fn()}
        onMoveTo={vi.fn()}
        onRemove={vi.fn()}
        onNoteChange={vi.fn()}
        detail={detail}
      />,
    );

    expect(getByText("badge Tractions")).toBeInTheDocument();
    expect(queryByText("grille Tractions")).not.toBeInTheDocument();

    await user.click(getByRole("button", { name: "Tractions", expanded: false }));

    expect(getByText("grille Tractions")).toBeInTheDocument();
    expect(getByRole("button", { name: "Tractions", expanded: true })).toBeInTheDocument();
  });
});
