import type { SessionDto } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessions } from "@/feature/library/hook/useSessions";
import { renderWithProviders } from "../../../../test/render";
import { SessionList } from "./SessionList";

/** Le transport a ses propres tests (`useSessions.test`) : ici, ce que la liste MONTRE de chaque état. */
vi.mock("@/feature/library/hook/useSessions", () => ({ useSessions: vi.fn() }));

const refetch = vi.fn();

const session = (id: string, title: string) =>
  ({ id, title, notes: null, exercises: [] }) as unknown as SessionDto;

function state(overrides: { data?: SessionDto[]; isPending?: boolean; isError?: boolean }) {
  vi.mocked(useSessions).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useSessions>);
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SessionList", () => {
  it("dit qu'elle charge, et rien d'autre", () => {
    state({ isPending: true });
    const { getByText, queryByText } = setup();

    expect(getByText("common.loading")).toBeInTheDocument();
    expect(queryByText("library.session.emptyTitle")).not.toBeInTheDocument();
  });

  it("propose de réessayer en cas d'échec", async () => {
    state({ isError: true });
    const { user, getByRole, queryByText } = setup();

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(refetch).toHaveBeenCalledOnce();
    // Une erreur n'est pas une bibliothèque vide : pas d'invitation à créer la première séance.
    expect(queryByText("library.session.emptyTitle")).not.toBeInTheDocument();
  });

  it("invite à créer la première séance quand il n'y en a aucune", async () => {
    state({ data: [] });
    const { user, getByRole, getByText, onCreate } = setup();

    expect(getByText("library.session.emptyDescription")).toBeInTheDocument();
    await user.click(getByRole("button", { name: "library.newSession" }));

    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("montre chaque séance, et ouvre celle qu'on choisit", async () => {
    const force = session("s-1", "Force max");
    state({ data: [force, session("s-2", "Continuité")] });
    const { user, getByRole, getAllByRole, queryByText, onEdit } = setup();

    expect(getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Force max",
      "Continuité",
    ]);
    expect(queryByText("library.session.emptyTitle")).not.toBeInTheDocument();
    await user.click(getByRole("button", { name: /Force max/ }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(force);
  });
});
