import { AdjustmentLevel, BlockType, type ExerciseBlocks, structurePath } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import type { CompositionItem } from "../hook/useSessionDraft";
import { CompositionCard } from "./CompositionCard";

const MOVE_UP = "library.session.moveUp";
const MOVE_DOWN = "library.session.moveDown";
const MENU = "library.session.cardMenu";
const RESET_ALL = "library.session.resetAll";
const NOTE_LABEL = "library.session.noteLabel";

const BLOCK_ID = "block-1";

const blocks: ExerciseBlocks = [
  {
    id: BLOCK_ID,
    label: null,
    structure: { type: BlockType.FREE },
    metrics: [
      {
        id: "m-1",
        source: "CATALOG",
        key: "REPETITIONS",
        unit: "REPS",
        label: null,
        collapsed: false,
      },
    ],
    rows: [],
  },
] as unknown as ExerciseBlocks;

const item = (over: Partial<CompositionItem> = {}): CompositionItem => ({
  key: "item-1",
  id: "sx-1",
  exerciseId: "ex-1",
  title: "Traction lestée",
  tags: [],
  note: "",
  blocks,
  baseline: blocks,
  adjustments: [],
  ...over,
});

/** Un exercice ajouté mais pas encore enregistré : la CLÉ `id` est absente, pas `undefined`. */
const unsavedItem = (): CompositionItem => {
  const { id: _id, ...rest } = item();
  return rest;
};

function setup(over: Partial<Parameters<typeof CompositionCard>[0]> = {}) {
  const handlers = {
    onNoteChange: vi.fn(),
    onCellChange: vi.fn(),
    onStructureChange: vi.fn(),
    onRowsChange: vi.fn(),
    onRevertCell: vi.fn(),
    onRevertStructureField: vi.fn(),
    onResetAll: vi.fn(),
    onReload: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onMove: vi.fn(),
  };
  const view = renderWithProviders(
    <CompositionCard
      item={item()}
      customMetrics={[]}
      isReloading={false}
      dragHandle={null}
      isDropTarget={false}
      isFirst={false}
      isLast={false}
      {...handlers}
      {...over}
    />,
  );
  return { ...view, ...handlers };
}

describe("CompositionCard", () => {
  it("est repliée au premier rendu", () => {
    const { getByRole, queryByLabelText } = setup();

    // Une séance de six exercices dépliés est illisible : la phrase de dosage suffit à
    // reconnaître ce qu'on a composé.
    expect(getByRole("button", { name: /Traction lestée/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(queryByLabelText(NOTE_LABEL)).not.toBeInTheDocument();
  });

  it("montre la note de l'exercice une fois dépliée", async () => {
    const { user, getByRole, getByLabelText } = setup();

    await user.click(getByRole("button", { name: /Traction lestée/ }));

    expect(getByLabelText(NOTE_LABEL)).toBeInTheDocument();
  });

  describe("le déplacement dans la séance", () => {
    it("ferme la montée sur le premier exercice", () => {
      const { getByRole } = setup({ isFirst: true });

      expect(getByRole("button", { name: MOVE_UP })).toBeDisabled();
      expect(getByRole("button", { name: MOVE_DOWN })).toBeEnabled();
    });

    it("ferme la descente sur le dernier", () => {
      const { getByRole } = setup({ isLast: true });

      expect(getByRole("button", { name: MOVE_DOWN })).toBeDisabled();
    });

    it("annonce le sens du déplacement", async () => {
      const { user, getByRole, onMove } = setup();

      await user.click(getByRole("button", { name: MOVE_DOWN }));

      // Les flèches doublent le glisser, qui est inaccessible au clavier : c'est le seul chemin
      // pour réordonner sans souris.
      expect(onMove).toHaveBeenCalledWith(1);
    });
  });

  describe("les ajustements", () => {
    const adjusted = item({
      adjustments: [{ path: structurePath(BLOCK_ID, "setCount"), level: AdjustmentLevel.SESSION }],
    });

    it("ne montre aucun compte quand rien n'est ajusté", () => {
      const { queryByText } = setup();

      expect(queryByText("library.session.adjustedCount")).not.toBeInTheDocument();
    });

    it("annonce qu'il y a des ajustements", () => {
      const { getByText } = setup({ item: adjusted });

      expect(getByText("library.session.adjustedCount")).toBeInTheDocument();
    });

    it("ferme la remise à zéro tant qu'il n'y a rien à remettre", async () => {
      const { user, getByRole } = setup();

      await user.click(getByRole("button", { name: MENU }));

      expect(getByRole("button", { name: RESET_ALL })).toBeDisabled();
    });

    it("ouvre la remise à zéro dès qu'un ajustement existe", async () => {
      const { user, getByRole, onResetAll } = setup({ item: adjusted });

      await user.click(getByRole("button", { name: MENU }));
      await user.click(getByRole("button", { name: RESET_ALL }));

      expect(onResetAll).toHaveBeenCalled();
    });
  });

  describe("le rechargement depuis la bibliothèque", () => {
    it("ne recharge pas sans confirmation", async () => {
      const { user, getByRole, onReload } = setup();

      await user.click(getByRole("button", { name: MENU }));
      await user.click(getByRole("button", { name: "library.session.reload" }));

      // Le rechargement ÉCRASE la composition et perd les ajustements : le déclencher au premier
      // clic ferait perdre un travail sans retour possible.
      expect(onReload).not.toHaveBeenCalled();
      expect(getByRole("button", { name: "library.session.reloadConfirm" })).toBeInTheDocument();
    });

    it("recharge une fois confirmé", async () => {
      const { user, getByRole, onReload } = setup();

      await user.click(getByRole("button", { name: MENU }));
      await user.click(getByRole("button", { name: "library.session.reload" }));
      await user.click(getByRole("button", { name: "library.session.reloadConfirm" }));

      expect(onReload).toHaveBeenCalled();
    });

    it("ferme le rechargement d'un exercice pas encore enregistré", async () => {
      const { user, getByRole } = setup({ item: unsavedItem() });

      await user.click(getByRole("button", { name: MENU }));

      // Sans identifiant en base, il n'y a rien à recharger DEPUIS : la bibliothèque ne connaît
      // pas encore cette ligne.
      expect(getByRole("button", { name: "library.session.reload" })).toBeDisabled();
    });
  });
});
