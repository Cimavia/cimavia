import {
  type CoachOrganizationDto,
  LibraryScope,
  MyAccessLevel,
  type SessionDto,
} from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";
import { useChangeSessionAccess, useSessions } from "@/feature/library/hook/useSessions";
import { renderWithProviders } from "../../../../test/render";
import { SessionList } from "./SessionList";

/** Le transport a ses propres tests (`useSessions.test`) : ici, ce que la liste MONTRE de chaque état. */
vi.mock("@/feature/library/hook/useSessions", () => ({
  useSessions: vi.fn(),
  useChangeSessionAccess: vi.fn(),
}));
vi.mock("@/feature/library/hook/useMyOrganizations", () => ({ useMyOrganizations: vi.fn() }));

const refetch = vi.fn();
const refetchOrganizations = vi.fn();
const F: CoachOrganizationDto = { id: "org-f", name: "F", coaches: [] };

const session = (id: string, title: string, tags: string[][] = [], owner = "C") =>
  ({
    id,
    title,
    notes: null,
    exercises: tags.map((exerciseTags, index) => ({ id: `${id}-${index}`, tags: exerciseTags })),
    owner: { id: owner, name: owner },
    myAccess: {
      level: owner === "C" ? MyAccessLevel.OWNER : MyAccessLevel.READ,
      via: owner === "C" ? null : F,
    },
    grants: owner === "C" ? [] : null,
    updatedAt: "2026-10-06T08:00:00.000Z",
  }) as unknown as SessionDto;

function state(overrides: { data?: SessionDto[]; isError?: boolean }) {
  vi.mocked(useSessions).mockReturnValue({
    data: undefined,
    isError: false,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useSessions>);
  vi.mocked(useChangeSessionAccess).mockReturnValue({
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useChangeSessionAccess>);
}

/** Les entreprises du Coach : aucune par défaut, `undefined` = pas encore lues. */
function organizations(data: CoachOrganizationDto[] | undefined, isError = false) {
  vi.mocked(useMyOrganizations).mockReturnValue({
    data,
    isError,
    refetch: refetchOrganizations,
  } as unknown as ReturnType<typeof useMyOrganizations>);
}

function setup() {
  const onCreate = vi.fn();
  const onEdit = vi.fn();
  return {
    ...renderWithProviders(<SessionList onCreate={onCreate} onEdit={onEdit} />),
    onCreate,
    onEdit,
  };
}

const titles = (view: ReturnType<typeof setup>) =>
  view
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("button")?.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  organizations([]);
});

describe("SessionList — états", () => {
  it("dit qu'elle charge, et rien d'autre", () => {
    state({});
    const { getByText, queryByText } = setup();

    expect(getByText("common.loading")).toBeInTheDocument();
    expect(queryByText("library.session.listEmpty.title")).not.toBeInTheDocument();
  });

  it("attend de savoir si le Coach partage avant d'afficher la liste", () => {
    organizations(undefined);
    state({ data: [session("s-1", "Force max")] });
    const { getByText, queryByRole } = setup();

    expect(getByText("common.loading")).toBeInTheDocument();
    expect(queryByRole("table")).not.toBeInTheDocument();
  });

  it("propose de réessayer ce qui a échoué, et seulement ça", async () => {
    organizations(undefined, true);
    state({ isError: true });
    const { user, getByRole, queryByText } = setup();

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(refetch).toHaveBeenCalledOnce();
    expect(refetchOrganizations).toHaveBeenCalledOnce();
    // Une erreur n'est pas une bibliothèque vide : pas d'invitation à créer la première séance.
    expect(queryByText("library.session.listEmpty.title")).not.toBeInTheDocument();
  });

  it("des séances lues ne se relisent pas quand seules les entreprises ont échoué", async () => {
    organizations(undefined, true);
    state({ data: [session("s-1", "Force max")] });
    const { user, getByRole } = setup();

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(refetchOrganizations).toHaveBeenCalledOnce();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("invite à créer la première séance quand il n'y en a aucune", async () => {
    state({ data: [] });
    const { user, getByRole, getByText, onCreate } = setup();

    expect(getByText("library.session.listEmpty.description")).toBeInTheDocument();
    await user.click(getByRole("button", { name: "library.newSession" }));

    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("montre chaque séance en ligne, avec son nombre d'exercices, et ouvre celle qu'on choisit", async () => {
    const force = session("s-1", "Force max", [["force"], [], ["grimpe"]]);
    state({ data: [force, session("s-2", "Continuité")] });
    const view = setup();

    expect(titles(view)).toEqual(["Force max", "Continuité"]);
    expect(view.getByText("library.table.exercises")).toBeInTheDocument();
    expect(view.getByText("3")).toBeInTheDocument();
    await view.user.click(view.getByRole("button", { name: "Force max" }));

    expect(view.onEdit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "s-1" }));
  });
});

describe("SessionList — recherche et tags", () => {
  const data = [
    session("s-1", "Force max", [["force"], ["grimpe"]]),
    session("s-2", "Endurance continuité", [["grimpe"]]),
    session("s-3", "Mobilité", [[]]),
  ];

  it("les tags d'une séance sont ceux de ses exercices ; sans aucun, « — »", () => {
    state({ data });
    const { getAllByRole } = setup();

    const [, force, , mobility] = getAllByRole("row");
    expect(force).toHaveTextContent(/force.*grimpe/);
    expect(mobility).toHaveTextContent("—");
  });

  it("filtre par tag, parmi les tags de la liste", async () => {
    state({ data });
    const view = setup();

    expect(
      view.getAllByRole("button", { name: /^(force|grimpe)$/ }).map((tag) => tag.textContent),
    ).toEqual(["force", "grimpe"]);
    await view.user.click(view.getByRole("button", { name: "force" }));

    expect(titles(view)).toEqual(["Force max"]);
  });

  it("cherche dans les titres, sans tenir compte des accents ni de la casse", async () => {
    state({ data });
    const view = setup();

    await view.user.type(view.getByLabelText("library.searchLabel"), "MOBILITE");

    expect(titles(view)).toEqual(["Mobilité"]);
  });

  it("une recherche vaine le dit, sans proposer de créer", async () => {
    state({ data });
    const { user, getByLabelText, getByText, queryByRole } = setup();

    await user.type(getByLabelText("library.searchLabel"), "Projet");

    expect(getByText("library.session.noMatch")).toBeInTheDocument();
    expect(queryByRole("button", { name: "library.newSession" })).not.toBeInTheDocument();
  });

  it("un tag qui ne trouve plus rien reste proposé, pour pouvoir le défaire", async () => {
    state({ data });
    const view = setup();
    await view.user.click(view.getByRole("button", { name: "force" }));

    state({ data: [session("s-3", "Mobilité", [[]])] });
    view.rerender(<SessionList onCreate={vi.fn()} onEdit={vi.fn()} />);

    expect(view.getByText("library.noFilterMatch")).toBeInTheDocument();
    await view.user.click(view.getByRole("button", { name: "library.filterAllTags" }));
    expect(titles(view)).toEqual(["Mobilité"]);
  });
});

describe("SessionList — partage", () => {
  it("sans entreprise : toutes les séances, ni filtre de portée ni colonne d'accès", () => {
    state({ data: [session("s-1", "Force max")] });
    const { queryByRole, queryByText } = setup();

    expect(vi.mocked(useSessions)).toHaveBeenLastCalledWith(LibraryScope.ALL);
    expect(queryByRole("button", { name: "library.scope.shared" })).not.toBeInTheDocument();
    expect(queryByText("library.table.access")).not.toBeInTheDocument();
  });

  it("avec une entreprise : la portée se choisit et se demande", async () => {
    organizations([F]);
    state({ data: [session("s-1", "Force max"), session("s-2", "Technique dalle", [], "M")] });
    const { user, getByRole, getByText } = setup();

    expect(getByText("library.access.sharedBy")).toBeInTheDocument();
    await user.click(getByRole("button", { name: "library.scope.mine" }));

    expect(vi.mocked(useSessions)).toHaveBeenLastCalledWith(LibraryScope.MINE);
  });

  it("le panneau des accès d'une séance parle de séances", async () => {
    organizations([F]);
    state({ data: [session("s-1", "Force max")] });
    const { user, getByRole, getByText } = setup();

    await user.click(getByRole("button", { name: "library.access.private" }));

    expect(getByText("library.access.session.mine")).toBeInTheDocument();
  });

  it("un tag sans résultat parmi les partagés n'affirme pas que rien n'est partagé", async () => {
    organizations([F]);
    const force = session("s-1", "Force max", [["force"]]);
    const dalle = session("s-2", "Technique dalle", [["grimpe"]], "M");
    state({});
    vi.mocked(useSessions).mockImplementation(
      (scope) =>
        ({
          data: scope === LibraryScope.SHARED ? [dalle] : [force, dalle],
          isError: false,
          refetch,
        }) as unknown as ReturnType<typeof useSessions>,
    );
    const { user, getByRole, getByText, queryByText } = setup();

    await user.click(getByRole("button", { name: "library.scope.shared" }));
    await user.click(getByRole("button", { name: "force" }));

    expect(getByText("library.noFilterMatch")).toBeInTheDocument();
    expect(queryByText("library.access.session.sharedEmpty")).not.toBeInTheDocument();
  });

  it("« Partagés avec moi » vide le dit, sans proposer de créer (frame 4)", async () => {
    organizations([F]);
    state({ data: [] });
    const { user, getByRole, getByText, queryByRole } = setup();

    await user.click(getByRole("button", { name: "library.scope.shared" }));

    expect(getByText("library.access.session.sharedEmpty")).toBeInTheDocument();
    expect(queryByRole("button", { name: "library.newSession" })).not.toBeInTheDocument();
  });
});
