import {
  AdjustmentLevel,
  BlockType,
  cellPath,
  type ExerciseBlock,
  type ExerciseBlocks,
  SESSION_NOTE_MAX_LENGTH,
  structurePath,
} from "@cmv/shared";
import { fireEvent, within } from "@testing-library/react";
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
    expect(getByLabelText(NOTE_LABEL)).toHaveAttribute(
      "maxLength",
      String(SESSION_NOTE_MAX_LENGTH),
    );
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

  describe("les gestes de la carte", () => {
    it("annonce la montée", async () => {
      const { user, getByRole, onMove } = setup();

      await user.click(getByRole("button", { name: MOVE_UP }));

      expect(onMove).toHaveBeenCalledExactlyOnceWith(-1);
    });

    // La teinte se pose sur la carte elle-même : sur un parent, son fond la masquerait.
    it.each([
      [true, "bg-cmv-accent-soft"],
      [false, "bg-cmv-surface"],
    ])("se teinte en cible de dépôt : %s", (isDropTarget, tint) => {
      const { getByRole } = setup({ isDropTarget });

      expect(getByRole("article")).toHaveClass(tint);
    });

    it("se replie au second clic sur son titre", async () => {
      const { user, getByRole, queryByLabelText } = setup();
      const title = getByRole("button", { name: /Traction lestée/ });

      await user.click(title);
      await user.click(title);

      expect(title).toHaveAttribute("aria-expanded", "false");
      expect(queryByLabelText(NOTE_LABEL)).not.toBeInTheDocument();
    });

    it("remonte la note tapée", async () => {
      const { user, getByRole, getByLabelText, onNoteChange } = setup();

      await user.click(getByRole("button", { name: /Traction lestée/ }));
      fireEvent.change(getByLabelText(NOTE_LABEL), { target: { value: "Lestées 5 kg" } });

      expect(onNoteChange).toHaveBeenCalledExactlyOnceWith("Lestées 5 kg");
    });
  });

  describe("le menu de la carte", () => {
    it.each([
      ["library.session.duplicate", "onDuplicate"],
      ["library.session.remove", "onRemove"],
    ] as const)("« %s » remonte le geste", async (name, handler) => {
      const view = setup();

      await view.user.click(view.getByRole("button", { name: MENU }));
      await view.user.click(view.getByRole("button", { name }));

      expect(view[handler]).toHaveBeenCalledOnce();
    });

    it("se referme après la remise à zéro", async () => {
      const { user, getByRole, queryByRole } = setup({
        item: item({
          adjustments: [
            { path: structurePath(BLOCK_ID, "setCount"), level: AdjustmentLevel.SESSION },
          ],
        }),
      });

      await user.click(getByRole("button", { name: MENU }));
      await user.click(getByRole("button", { name: RESET_ALL }));

      expect(queryByRole("button", { name: RESET_ALL })).not.toBeInTheDocument();
    });

    // Un rechargement déjà en cours : le relancer doublerait la requête.
    it("ferme le rechargement pendant qu'il tourne", async () => {
      const { user, getByRole } = setup({ isReloading: true });

      await user.click(getByRole("button", { name: MENU }));

      expect(getByRole("button", { name: "library.session.reload" })).toBeDisabled();
    });

    it("renonce au rechargement sans rien recharger", async () => {
      const { user, getByRole, queryByRole, onReload } = setup();

      await user.click(getByRole("button", { name: MENU }));
      await user.click(getByRole("button", { name: "library.session.reload" }));
      await user.click(getByRole("button", { name: "library.builder.cancel" }));

      expect(onReload).not.toHaveBeenCalled();
      expect(
        queryByRole("button", { name: "library.session.reloadConfirm" }),
      ).not.toBeInTheDocument();
    });

    it("se referme une fois la confirmation demandée", async () => {
      const { user, getByRole, queryByRole } = setup();

      await user.click(getByRole("button", { name: MENU }));
      await user.click(getByRole("button", { name: "library.session.reload" }));

      expect(queryByRole("button", { name: "library.session.duplicate" })).not.toBeInTheDocument();
    });
  });

  describe("le dosage déplié", () => {
    const SERIES_ID = "block-s";
    const seriesBlock = (id: string, label: string | null): ExerciseBlock =>
      ({
        id,
        label,
        structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
        metrics: [
          {
            id: `${id}-reps`,
            source: "CATALOG",
            key: "REPETITIONS",
            unit: "REPS",
            label: null,
            collapsed: false,
          },
        ],
        rows: [{ id: `${id}-r1`, values: { [`${id}-reps`]: 6 } }],
      }) as unknown as ExerciseBlock;

    async function opened(over: Partial<CompositionItem> = {}) {
      const series = [seriesBlock(SERIES_ID, "Travail")];
      const view = setup({ item: item({ blocks: series, baseline: series, ...over }) });
      await view.user.click(view.getByRole("button", { name: /Traction lestée/ }));
      return view;
    }

    it("résume le dosage sous le titre, carte repliée", () => {
      const series = [seriesBlock(SERIES_ID, null)];
      const { getByText } = setup({ item: item({ blocks: series, baseline: series }) });

      expect(getByText(/^exercise\.dosage\.series/)).toBeInTheDocument();
    });

    // Un exercice sans rien à résumer : pas de phrase vide sous le titre.
    it("tait le résumé quand il n'y a rien à résumer", () => {
      const { queryByText } = setup();

      expect(queryByText(/exercise\.dosage/)).not.toBeInTheDocument();
    });

    // « Travail » n'a de sens qu'à côté d'un autre bloc : seul, le libellé est du bruit.
    it("nomme les blocs quand il y en a plusieurs, et seulement ceux qui ont un nom", async () => {
      const both = [seriesBlock("b-a", "Échauffement"), seriesBlock("b-b", null)];
      const { getByText, getAllByRole } = await opened({ blocks: both, baseline: both });

      expect(getByText("Échauffement")).toBeInTheDocument();
      expect(getAllByRole("table")).toHaveLength(2);
    });

    it("tait le nom d'un bloc seul", async () => {
      const { queryByText } = await opened();

      expect(queryByText("Travail")).not.toBeInTheDocument();
    });

    it("remonte un changement du bandeau, désigné par son bloc", async () => {
      const { getByRole, onStructureChange } = await opened();

      fireEvent.change(getByRole("spinbutton", { name: "library.builder.bandeau.setCount" }), {
        target: { value: "5" },
      });

      expect(onStructureChange).toHaveBeenCalledExactlyOnceWith(
        SERIES_ID,
        expect.objectContaining({ setCount: 5 }),
      );
    });

    it("remonte une valeur saisie, désignée par son bloc, sa ligne et sa colonne", async () => {
      const { user, getByRole, onCellChange } = await opened();
      // La première série : les suivantes, fantômes, la reprennent (#520).
      const cell = within(getByRole("table")).getAllByRole("textbox")[0] as HTMLElement;

      await user.clear(cell);
      await user.type(cell, "8");
      await user.tab();

      expect(onCellChange).toHaveBeenLastCalledWith(
        SERIES_ID,
        `${SERIES_ID}-r1`,
        `${SERIES_ID}-reps`,
        8,
      );
    });

    // Une Séries n'ajoute pas de ligne : c'est la saisie dans une série fantôme qui lui en donne une.
    it("remonte les lignes de la grille, désignées par leur bloc", async () => {
      const { user, getByRole, onRowsChange } = await opened();
      const series2 = within(getByRole("table")).getAllByRole("textbox")[1] as HTMLElement;

      await user.clear(series2);
      await user.type(series2, "8");
      await user.tab();

      expect(onRowsChange).toHaveBeenCalledExactlyOnceWith(SERIES_ID, expect.any(Array));
      expect(onRowsChange.mock.calls[0]?.[1]).toHaveLength(2);
    });

    it("rend une valeur ajustée à son défaut, désignée par son bloc, sa ligne et sa colonne", async () => {
      const { user, getByRole, onRevertCell } = await opened({
        adjustments: [
          {
            path: cellPath(SERIES_ID, `${SERIES_ID}-r1`, `${SERIES_ID}-reps`),
            level: AdjustmentLevel.SESSION,
          },
        ],
      });

      await user.click(
        within(getByRole("table")).getByRole("button", { name: "library.session.revert" }),
      );

      expect(onRevertCell).toHaveBeenCalledExactlyOnceWith(
        SERIES_ID,
        `${SERIES_ID}-r1`,
        `${SERIES_ID}-reps`,
      );
    });
  });

  describe("les paramètres de bandeau ajustés", () => {
    const OTHER = "block-2";

    async function opened(adjustments: CompositionItem["adjustments"]) {
      const view = setup({ item: item({ adjustments }) });
      await view.user.click(view.getByRole("button", { name: /Traction lestée/ }));
      return view;
    }

    it("nomme chaque paramètre ajusté de SON bloc, et rend chacun à son défaut", async () => {
      const { user, getAllByRole, getByText, onRevertStructureField } = await opened([
        { path: structurePath(BLOCK_ID, "setCount"), level: AdjustmentLevel.SESSION },
        { path: structurePath(BLOCK_ID, "restBetweenSetsSeconds"), level: AdjustmentLevel.SESSION },
      ]);

      expect(getByText("library.builder.bandeau.setCount")).toBeInTheDocument();
      expect(getByText("library.builder.bandeau.restBetweenSetsSeconds")).toBeInTheDocument();
      await user.click(
        getAllByRole("button", { name: "library.session.revert" })[1] as HTMLElement,
      );

      expect(onRevertStructureField).toHaveBeenCalledExactlyOnceWith(
        BLOCK_ID,
        "restBetweenSetsSeconds",
      );
    });

    // Ni l'ajustement d'un autre bloc, ni celui d'une cellule ne sont des paramètres de CE bandeau.
    it("ignore les ajustements d'un autre bloc et ceux des cellules", async () => {
      const { queryByRole } = await opened([
        { path: structurePath(OTHER, "setCount"), level: AdjustmentLevel.SESSION },
        { path: cellPath(BLOCK_ID, "r-1", "m-1"), level: AdjustmentLevel.SESSION },
      ]);

      expect(queryByRole("button", { name: "library.session.revert" })).not.toBeInTheDocument();
    });
  });
});
