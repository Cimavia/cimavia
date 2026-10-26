import {
  STRUCTURE_PRESETS,
  type StructureDto,
  type StructureLibraryDto,
  StructurePresetKey,
} from "@cmv/shared";
import { within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteStructure, useStructureLibrary } from "@/feature/library/hook/useStructures";
import { renderWithProviders } from "../../../../test/render";
import { keptCopiesHint, StructureList } from "./StructureList";

/** Le transport a ses propres tests (`useStructures.test`) : ici, ce que la liste MONTRE. */
vi.mock("@/feature/library/hook/useStructures", () => ({
  useStructureLibrary: vi.fn(),
  useDeleteStructure: vi.fn(),
}));

const remove = vi.fn();
const refetch = vi.fn();

const structure = (over: Partial<StructureDto>) =>
  ({
    id: "st-1",
    name: "4×4 grimpe",
    tags: ["grimpe"],
    note: "Garder 4 min.",
    instructions: null,
    settings: STRUCTURE_PRESETS.SERIES,
    sessionCount: 5,
    createdAt: "2026-10-12T08:00:00.000Z",
    updatedAt: "2026-10-12T08:00:00.000Z",
    ...over,
  }) as StructureDto;

const library: StructureLibraryDto = {
  presets: [
    { key: StructurePresetKey.SERIES, sessionCount: 14 },
    { key: StructurePresetKey.TABATA, sessionCount: 2 },
  ],
  structures: [
    structure({}),
    structure({ id: "st-2", name: "Départs 4 min", tags: ["cardio"], note: null, sessionCount: 0 }),
  ],
};

function served(data: StructureLibraryDto | undefined, isError = false) {
  vi.mocked(useStructureLibrary).mockReturnValue({
    data,
    isError,
    refetch,
  } as unknown as ReturnType<typeof useStructureLibrary>);
  vi.mocked(useDeleteStructure).mockReturnValue({
    mutate: remove,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteStructure>);
}

function setup() {
  const onCreate = vi.fn();
  const onEdit = vi.fn();
  const onDuplicate = vi.fn();
  return {
    ...renderWithProviders(
      <StructureList onCreate={onCreate} onEdit={onEdit} onDuplicate={onDuplicate} />,
    ),
    onCreate,
    onEdit,
    onDuplicate,
  };
}

const tables = (view: ReturnType<typeof setup>) => view.queryAllByRole("table");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StructureList — affichage", () => {
  it("attend la bibliothèque, puis propose de réessayer si elle ne vient pas", async () => {
    served(undefined, true);
    const view = setup();

    await view.user.click(view.getByRole("button", { name: "common.retry" }));

    expect(refetch).toHaveBeenCalled();
    expect(tables(view)).toHaveLength(0);
  });

  it("montre les structures prêtes, puis celles du Coach", () => {
    served(library);
    const view = setup();

    const [presets, mine] = tables(view);
    expect(within(presets as HTMLElement).getByText("block.preset.tabata")).toBeInTheDocument();
    expect(within(presets as HTMLElement).getByText("14")).toBeInTheDocument();
    expect(within(mine as HTMLElement).getByText("Garder 4 min.")).toBeInTheDocument();
    expect(within(mine as HTMLElement).getByText("Départs 4 min")).toBeInTheDocument();
    expect(view.getByText("library.structure.footer")).toBeInTheDocument();
  });

  it("sans structure à soi, invite à en créer une sous les prêtes", async () => {
    served({ ...library, structures: [] });
    const view = setup();

    expect(tables(view)).toHaveLength(1);
    expect(view.getByText("library.structure.empty.title")).toBeInTheDocument();
    // Celui de l'en-tête de section, et celui de l'état vide.
    const [, fromEmpty] = view.getAllByRole("button", { name: "library.structure.create" });
    await view.user.click(fromEmpty as HTMLElement);

    expect(view.onCreate).toHaveBeenCalled();
  });
});

describe("StructureList — gestes", () => {
  it("duplique une structure prête, qui ne s'ouvre pas", async () => {
    served(library);
    const view = setup();

    const [, tabata] = view.getAllByRole("button", { name: "library.structure.duplicate" });
    await view.user.click(tabata as HTMLElement);

    expect(view.onDuplicate).toHaveBeenCalledWith({ preset: "TABATA" });
  });

  it("ouvre et duplique une structure du Coach", async () => {
    served(library);
    const view = setup();

    await view.user.click(view.getByRole("button", { name: /4×4 grimpe/ }));
    const [mine] = view.getAllByRole("button", { name: "library.structure.duplicateNamed" });
    await view.user.click(mine as HTMLElement);

    expect(view.onEdit).toHaveBeenCalledWith(library.structures[0]);
    expect(view.onDuplicate).toHaveBeenCalledWith({ structureId: "st-1" });
  });

  it("supprime une structure du Coach après confirmation", async () => {
    served(library);
    const view = setup();

    const [first] = view.getAllByRole("button", { name: "library.structure.deleteNamed" });
    await view.user.click(first as HTMLElement);
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    expect(remove).toHaveBeenCalledWith(library.structures[0], expect.anything());
  });
});

describe("StructureList — recherche et tags", () => {
  it("cherche dans les noms des prêtes, traduits, comme dans ceux du Coach", async () => {
    served(library);
    const view = setup();

    await view.user.type(view.getByLabelText("library.searchLabel"), "départs");

    expect(tables(view)).toHaveLength(1);
    expect(view.getByText("Départs 4 min")).toBeInTheDocument();
    expect(view.getByText(/library\.structure\.mine\.results/)).toBeInTheDocument();

    await view.user.clear(view.getByLabelText("library.searchLabel"));
    await view.user.type(view.getByLabelText("library.searchLabel"), "tabata");
    expect(view.getByText("block.preset.tabata")).toBeInTheDocument();
    expect(view.queryByText("block.preset.series")).not.toBeInTheDocument();
  });

  it("un tag cache les prêtes, qui n'en ont pas, et le dit", async () => {
    served(library);
    const view = setup();

    await view.user.click(view.getByRole("button", { name: "cardio" }));

    expect(tables(view)).toHaveLength(1);
    expect(view.queryByText("block.preset.tabata")).not.toBeInTheDocument();
    expect(view.getByText("library.structure.presets.noTags")).toBeInTheDocument();
  });

  it("efface le filtre d'un geste", async () => {
    served(library);
    const view = setup();
    await view.user.click(view.getByRole("button", { name: "cardio" }));

    await view.user.click(view.getByRole("button", { name: "library.structure.mine.clearFilter" }));

    expect(tables(view)).toHaveLength(2);
  });

  it("un tag qui ne trouve plus rien le dit, et reste proposé pour le défaire", async () => {
    served(library);
    const view = setup();
    await view.user.click(view.getByRole("button", { name: "cardio" }));

    // La structure qui le portait a été supprimée depuis.
    served({ ...library, structures: [structure({})] });
    view.rerender(<StructureList onCreate={vi.fn()} onEdit={vi.fn()} onDuplicate={vi.fn()} />);

    expect(view.getByText("library.noFilterMatch")).toBeInTheDocument();
    await view.user.click(view.getByRole("button", { name: "library.filterAllTags" }));
    expect(tables(view)).toHaveLength(2);
  });

  it("une recherche vaine le dit, sans proposer de créer", async () => {
    served(library);
    const view = setup();

    await view.user.type(view.getByLabelText("library.searchLabel"), "Projet");

    expect(view.getByText("library.structure.noMatch")).toBeInTheDocument();
    expect(
      view.queryByRole("button", { name: "library.structure.create" }),
    ).not.toBeInTheDocument();
  });
});

describe("keptCopiesHint", () => {
  const t = ((key: string, options: { count: number }) => `${key}:${options.count}`) as never;

  it("ne dit rien quand aucune séance n'emploie la structure", () => {
    expect(keptCopiesHint({ sessionCount: 0 }, t)).toBeUndefined();
  });

  it("annonce que les séances gardent leur copie", () => {
    expect(keptCopiesHint({ sessionCount: 5 }, t)).toBe("library.structure.deleteKeepsCopies:5");
  });
});
