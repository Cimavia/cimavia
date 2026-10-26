import {
  ApiError,
  NEW_STRUCTURE_SETTINGS,
  ProblemType,
  STRUCTURE_PRESETS,
  type StructureDto,
  type StructureLibraryDto,
} from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { StructureBuilderScreen } from "./StructureBuilderScreen";

const api = vi.hoisted(() => ({
  listStructures: vi.fn(),
  getStructure: vi.fn(),
  createStructure: vi.fn(),
  updateStructure: vi.fn(),
  deleteStructure: vi.fn(),
}));

// Les appels sont remplacés, les hooks et les clés de cache restent les VRAIS.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  ...api,
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "coach-1", name: "Cédric" } } }),
    signOut: vi.fn(),
  },
}));
vi.mock("@/feature/notification", () => ({
  NotificationBell: () => null,
  useUnreadByCapability: () => ({ data: undefined }),
}));

const NAME = /library\.structure\.nameLabel/;
const SUBMIT_CREATE = "library.structure.submitCreate";
const SUBMIT_EDIT = "library.structure.submitEdit";

const grimpe = (over: Partial<StructureDto> = {}): StructureDto => ({
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
});

const library = (structures: StructureDto[] = [grimpe()]): StructureLibraryDto => ({
  presets: [],
  structures,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.listStructures.mockResolvedValue(library());
  api.getStructure.mockResolvedValue(grimpe());
  api.createStructure.mockResolvedValue(grimpe({ id: "st-9" }));
  api.updateStructure.mockResolvedValue(grimpe());
  api.deleteStructure.mockResolvedValue(undefined);
});

const SHELL_LINKS = ["/", "/messages", "/plans", "/invoices", "/reminders", "/account", "/library"];

function create(from?: string) {
  return renderInRoute(<StructureBuilderScreen from={from} />, {
    path: "/library/structures/new",
    links: SHELL_LINKS,
  });
}

function edit() {
  return renderInRoute(<StructureBuilderScreen structureId="st-1" />, {
    path: "/library/structures/$structureId",
    params: { structureId: "st-1" },
    links: SHELL_LINKS,
  });
}

const heading = (view: Awaited<ReturnType<typeof create>>) =>
  view.getAllByRole("heading", { level: 1 })[0]?.textContent;

/** Revenu à l'onglet Structures de la bibliothèque. */
async function backToStructures(view: Awaited<ReturnType<typeof create>>) {
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
  expect(view.router.state.location.search).toEqual({ tab: "structures" });
}

describe("StructureBuilderScreen — chargement", () => {
  it("dit qu'il charge la structure demandée, sans formulaire", async () => {
    api.getStructure.mockReturnValue(new Promise(() => undefined));
    const view = await edit();

    expect(view.getByText("common.loading")).toBeInTheDocument();
    expect(heading(view)).toBe("library.structure.loadingTitle");
  });

  it("propose de réessayer quand la structure ne se charge pas", async () => {
    api.getStructure.mockRejectedValueOnce(new Error("500"));
    const view = await edit();

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByRole("textbox", { name: NAME })).toHaveValue("4×4 grimpe");
  });

  it("attend la bibliothèque pour une copie, et réessaie de la lire", async () => {
    api.listStructures.mockRejectedValueOnce(new Error("500"));
    const view = await create("st-1");

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByRole("textbox", { name: NAME })).toHaveValue(
      "library.structure.copyName",
    );
  });
});

describe("StructureBuilderScreen — création", () => {
  it("crée une structure neuve, puis revient à l'onglet Structures", async () => {
    const view = await create();
    expect(heading(view)).toBe("library.structure.createTitle");
    // Sans source, aucun bouton Supprimer : rien n'existe encore.
    expect(view.queryByRole("button", { name: "library.structure.delete" })).toBeNull();

    await view.user.type(view.getByRole("textbox", { name: NAME }), "  Départs 4 min ");
    await view.user.type(view.getByLabelText("library.tags.label"), "cardio{Enter}");
    // Une note faite d'espaces ne dit rien : elle part à `null`.
    await view.user.type(view.getByRole("textbox", { name: "library.structure.noteLabel" }), "  ");
    await view.user.type(
      view.getByRole("textbox", { name: "library.structure.instructionsLabel" }),
      "Pars au bip.",
    );
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    await backToStructures(view);
    expect(api.createStructure).toHaveBeenCalledWith({
      name: "Départs 4 min",
      tags: ["cardio"],
      note: null,
      instructions: "Pars au bip.",
      settings: NEW_STRUCTURE_SETTINGS,
    });
    expect(view.getByText("library.structure.saved")).toBeInTheDocument();
  });

  it("d'après une structure prête, en reprend les réglages sous un nom de copie", async () => {
    const view = await create("TABATA");

    // La copie attend la bibliothèque : le nom proposé doit y être libre.
    expect(await view.findByRole("textbox", { name: NAME })).toHaveValue(
      "library.structure.copyName",
    );
    expect(heading(view)).toBe("library.structure.createFrom");
    expect(view.getByRole("radio", { name: /library\.structure\.form\.cycle/ })).toBeChecked();
    expect(view.getByText("library.structure.savedWhere")).toBeInTheDocument();
  });

  it("numérote la copie quand son premier nom est pris", async () => {
    api.listStructures.mockResolvedValue(library([grimpe({ name: "library.structure.copyName" })]));
    const view = await create("TABATA");

    expect(await view.findByRole("textbox", { name: NAME })).toHaveValue(
      "library.structure.copyNameNth",
    );
  });

  it("dit l'enregistrement en cours", async () => {
    api.createStructure.mockReturnValue(new Promise(() => undefined));
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: NAME }), "Départs");

    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    expect(await view.findByRole("button", { name: "library.builder.saving" })).toBeDisabled();
  });

  it("d'après une structure du Coach, en reprend la note et les tags", async () => {
    const view = await create("st-1");

    expect(await view.findByRole("textbox", { name: "library.structure.noteLabel" })).toHaveValue(
      "Garder 4 min.",
    );
    expect(view.getByText("grimpe")).toBeInTheDocument();
  });

  it("réclame un nom, sans rien envoyer", async () => {
    const view = await create();
    const name = view.getByRole("textbox", { name: NAME });

    await view.user.type(name, "x");
    await view.user.clear(name);
    await view.user.tab();

    expect(view.getByText("library.structure.nameRequired")).toBeInTheDocument();
    expect(view.getByText("library.structure.points")).toBeInTheDocument();
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeDisabled();
  });

  // Maquette, frame 6 : avant d'envoyer, sans tenir compte des majuscules.
  it("refuse un nom déjà pris par une autre structure du Coach", async () => {
    const view = await create();
    await waitFor(() => expect(api.listStructures).toHaveBeenCalled());

    await view.user.type(view.getByRole("textbox", { name: NAME }), "4×4 GRIMPE");

    expect(await view.findByText("library.structure.nameTaken")).toBeInTheDocument();
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeDisabled();
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toHaveAttribute(
      "title",
      "library.structure.nameTakenSave",
    );

    // « Enregistrer » du dialogue de sortie passe outre le bouton fermé : il doit refuser aussi.
    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));
    await view.user.click(await view.findByRole("button", { name: "common.leave.save" }));

    expect(await view.findAllByText("library.structure.nameTakenSave")).not.toHaveLength(0);
    expect(api.createStructure).not.toHaveBeenCalled();
    expect(view.router.state.location.pathname).toBe("/library/structures/new");
  });

  it("dit le refus de l'API pour un nom pris ailleurs, tant que le nom ne change pas", async () => {
    api.createStructure.mockRejectedValueOnce(
      new ApiError(409, "Nom pris", null, true, ProblemType.STRUCTURE_NAME_TAKEN),
    );
    const view = await create();
    // Créée dans un autre onglet : la liste ne la connaît qu'à la relecture que le refus déclenche.
    api.listStructures.mockResolvedValue(
      library([grimpe(), grimpe({ id: "st-5", name: "Tabata long" })]),
    );
    const name = view.getByRole("textbox", { name: NAME });
    await view.user.type(name, "Tabata long");

    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    expect(await view.findByText("library.structure.nameTaken")).toBeInTheDocument();
    await waitFor(() => expect(api.listStructures).toHaveBeenCalledTimes(2));
    expect(view.getByText("library.structure.nameTaken")).toBeInTheDocument();
    await view.user.type(name, " 2");
    expect(view.queryByText("library.structure.nameTaken")).not.toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/structures/new");
  });

  it("oublie le refus quand la liste relue ne porte plus ce nom", async () => {
    api.createStructure.mockRejectedValueOnce(
      new ApiError(409, "Nom pris", null, true, ProblemType.STRUCTURE_NAME_TAKEN),
    );
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: NAME }), "Tabata long");

    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    // Supprimée entre-temps : la relecture ne la trouve pas, le nom redevient libre.
    await waitFor(() => expect(api.listStructures).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(view.queryByText("library.structure.nameTaken")).not.toBeInTheDocument(),
    );
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeEnabled();
  });

  it("une valeur refusée ferme l'enregistrement, et compte parmi les points à régler", async () => {
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: NAME }), "Départs");
    const rounds = view.getByRole("textbox", { name: "library.structure.form.roundsLabel" });

    await view.user.clear(rounds);
    await view.user.type(rounds, "200{Enter}");

    expect(view.getByText("library.structure.points")).toBeInTheDocument();
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toHaveAttribute(
      "title",
      "library.builder.refusedBlocksSave",
    );
  });
});

describe("StructureBuilderScreen — modification", () => {
  it("se présente sous son nom, et prévient que ses séances ne changent pas", async () => {
    const view = await edit();

    await view.findByRole("textbox", { name: NAME });
    expect(heading(view)).toBe("4×4 grimpe");
    expect(view.getByText("library.structure.mineUsed")).toBeInTheDocument();
    expect(view.getByText("library.structure.sessionsUnchanged")).toBeInTheDocument();
  });

  it("une structure qu'aucune séance n'emploie ne l'annonce pas", async () => {
    api.getStructure.mockResolvedValue(grimpe({ sessionCount: 0 }));
    const view = await edit();

    await view.findByRole("textbox", { name: NAME });
    expect(view.getByText("library.structure.mineSubtitle")).toBeInTheDocument();
    expect(view.queryByText("library.structure.sessionsUnchanged")).not.toBeInTheDocument();
  });

  it("garde son propre nom, et enregistre sous la version lue", async () => {
    const view = await edit();
    const name = await view.findByRole("textbox", { name: NAME });

    await view.user.clear(name);
    await view.user.type(name, "4×4 Grimpe");
    await view.user.click(view.getByRole("radio", { name: /library\.structure\.form\.once/ }));
    await view.user.click(view.getByRole("button", { name: SUBMIT_EDIT }));

    await backToStructures(view);
    expect(api.updateStructure).toHaveBeenCalledWith(
      "st-1",
      expect.objectContaining({
        name: "4×4 Grimpe",
        expectedUpdatedAt: "2026-10-12T08:00:00.000Z",
        settings: expect.objectContaining({ repeat: { kind: "ONCE" } }),
      }),
    );
  });

  it("dit un conflit d'édition par le bandeau, et recharge la dernière version", async () => {
    api.updateStructure.mockRejectedValueOnce(
      new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE),
    );
    const view = await edit();
    const name = await view.findByRole("textbox", { name: NAME });
    await view.user.type(name, " bis");
    await view.user.click(view.getByRole("button", { name: SUBMIT_EDIT }));
    expect(await view.findByText("library.structure.stale")).toBeInTheDocument();

    api.getStructure.mockResolvedValue(grimpe({ name: "4×4 grimpe v2" }));
    await view.user.click(view.getByRole("button", { name: "common.staleReload" }));

    await waitFor(() =>
      expect(view.getByRole("textbox", { name: NAME })).toHaveValue("4×4 grimpe v2"),
    );
    expect(view.queryByText("library.structure.stale")).not.toBeInTheDocument();
  });

  it("supprime après confirmation, en disant que les séances gardent leur copie", async () => {
    const view = await edit();

    await view.user.click(await view.findByRole("button", { name: "library.structure.delete" }));
    expect(view.getByText("library.structure.deleteKeepsCopies")).toBeInTheDocument();
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    await backToStructures(view);
    expect(api.deleteStructure).toHaveBeenCalledWith("st-1", {
      expectedUpdatedAt: "2026-10-12T08:00:00.000Z",
    });
  });

  it("une suppression refusée pour conflit le dit par le bandeau", async () => {
    api.deleteStructure.mockRejectedValueOnce(
      new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE),
    );
    const view = await edit();

    await view.user.click(await view.findByRole("button", { name: "library.structure.delete" }));
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    expect(await view.findByText("library.structure.staleDelete")).toBeInTheDocument();
  });

  it("enregistre depuis le dialogue de sortie, puis part", async () => {
    const view = await edit();
    await view.user.type(await view.findByRole("textbox", { name: NAME }), " bis");

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));
    await view.user.click(await view.findByRole("button", { name: "common.leave.save" }));

    await backToStructures(view);
    expect(api.updateStructure).toHaveBeenCalledWith(
      "st-1",
      expect.objectContaining({ name: "4×4 grimpe bis" }),
    );
  });

  it("demande avant d'abandonner une saisie", async () => {
    const view = await edit();
    await view.user.type(await view.findByRole("textbox", { name: NAME }), " bis");

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));
    await view.user.click(await view.findByRole("button", { name: "common.leave.discard" }));

    await backToStructures(view);
    expect(api.updateStructure).not.toHaveBeenCalled();
  });
});
