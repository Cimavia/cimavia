import {
  AccessLevel,
  type ChangeAccessInput,
  type CoachOrganizationDto,
  type ElementAccessDto,
  MyAccessLevel,
} from "@cmv/shared";
import { useMutation } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { LibraryTable, type LibraryTableRow } from "./LibraryTable";

// Un plafond bas : 201 lignes à rendre et cocher dépasseraient le délai d'un test.
vi.mock("@cmv/shared", async (original) => ({
  ...(await original<typeof import("@cmv/shared")>()),
  ACCESS_MAX_TARGETS: 2,
}));

const C = { id: "c", name: "C" };
const M = { id: "m", name: "M" };
const F: CoachOrganizationDto = {
  id: "org-f",
  name: "F",
  coaches: [
    { coachId: "c", name: "C" },
    { coachId: "m", name: "M" },
  ],
};

const mine = (id: string, title: string, tags: string[] = []): LibraryTableRow => ({
  id,
  title,
  tags,
  owner: C,
  myAccess: { level: MyAccessLevel.OWNER, via: null },
  grants: [],
  updatedAt: "2026-10-06T08:00:00.000Z",
});
const shared: LibraryTableRow = {
  id: "ex-9",
  title: "Lecture de voie",
  tags: [],
  owner: M,
  myAccess: { level: MyAccessLevel.READ, via: { id: "org-f", name: "F" } },
  grants: null,
  updatedAt: "2026-10-06T08:00:00.000Z",
};

function setup({
  rows,
  organizations = [F],
  extra,
}: {
  rows: LibraryTableRow[];
  organizations?: CoachOrganizationDto[];
  extra?: { label: string; cell: (row: LibraryTableRow) => string };
}) {
  const onOpen = vi.fn();
  const send = vi.fn(async (_input: ChangeAccessInput): Promise<ElementAccessDto[]> => []);
  function Harness() {
    const mutation = useMutation({ mutationFn: send });
    return (
      <LibraryTable
        rows={rows}
        organizations={organizations}
        copyPrefix="library.access.exercise"
        mutation={mutation}
        onOpen={onOpen}
        {...(extra == null ? {} : { extra })}
      />
    );
  }
  return { ...renderWithProviders(<Harness />), onOpen, send };
}

const selectAll = () => screen.getByRole("checkbox", { name: "library.table.selectAll" });
const select = () => screen.getAllByRole("checkbox", { name: "library.table.select" });

describe("LibraryTable — lignes", () => {
  it("une ligne par élément ; la ligne s'ouvre par son titre", async () => {
    const { user, onOpen } = setup({ rows: [mine("ex-1", "Tractions"), shared] });

    expect(screen.getAllByRole("row")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Tractions" }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "ex-1" }));
  });

  it("dit le propriétaire et l'accès de chaque ligne", () => {
    setup({ rows: [mine("ex-1", "Tractions"), shared] });

    const [, own, other] = screen.getAllByRole("row");
    expect(within(own as HTMLElement).getByText("library.access.me")).toBeInTheDocument();
    expect(within(own as HTMLElement).getByText("library.access.private")).toBeInTheDocument();
    expect(within(other as HTMLElement).getByText("M")).toBeInTheDocument();
    expect(within(other as HTMLElement).getByText("library.access.sharedBy")).toBeInTheDocument();
  });

  it("sans tag, la cellule dit « — » ; avec, elle les montre", () => {
    setup({ rows: [mine("ex-1", "Tractions", ["force"]), mine("ex-2", "Gainage")] });

    expect(screen.getByText("force")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("la colonne propre à l'onglet se place avant la date", () => {
    setup({ rows: [mine("s-1", "Force max")], extra: { label: "Exercices", cell: () => "3" } });

    const heads = screen.getAllByRole("columnheader").map((head) => head.textContent);
    expect(heads.slice(-2)).toEqual(["Exercices", "library.table.updatedAt"]);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("sans entreprise : ni propriétaire, ni accès, ni case à cocher (frame 14)", () => {
    setup({ rows: [mine("ex-1", "Tractions")], organizations: [] });

    expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual([
      "library.table.title",
      "library.table.tags",
      "library.table.updatedAt",
    ]);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("LibraryTable — sélection", () => {
  it("seuls les éléments du Coach se cochent", () => {
    setup({ rows: [mine("ex-1", "Tractions"), shared] });

    expect(select().map((box) => (box as HTMLInputElement).disabled)).toEqual([false, true]);
  });

  it("« tout sélectionner » coche les siens, et passe en indéterminé sur une partie", async () => {
    const { user } = setup({ rows: [mine("ex-1", "Tractions"), mine("ex-2", "Gainage"), shared] });

    await user.click(select()[0] as HTMLElement);
    expect((selectAll() as HTMLInputElement).indeterminate).toBe(true);
    expect(screen.getByText("library.access.exercise.selected")).toBeInTheDocument();

    await user.click(selectAll());
    expect(select().map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, false]);
    expect((selectAll() as HTMLInputElement).indeterminate).toBe(false);

    await user.click(selectAll());
    expect(select().map((box) => (box as HTMLInputElement).checked)).toEqual([false, false, false]);
  });

  it("une ligne cochée se décoche", async () => {
    const { user } = setup({ rows: [mine("ex-1", "Tractions")] });

    await user.click(select()[0] as HTMLElement);
    await user.click(select()[0] as HTMLElement);

    expect(select()[0]).not.toBeChecked();
    expect(screen.queryByText("library.access.exercise.selected")).not.toBeInTheDocument();
  });

  it("rien à soi, rien à tout sélectionner", () => {
    setup({ rows: [shared] });

    expect(selectAll()).toBeDisabled();
  });

  it("« Désélectionner » vide la sélection et retire la barre", async () => {
    const { user } = setup({ rows: [mine("ex-1", "Tractions")] });

    await user.click(select()[0] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "library.table.clearSelection" }));

    expect(screen.queryByText("library.access.exercise.selected")).not.toBeInTheDocument();
  });

  it("la sélection s'ouvre dans le panneau, et y survit à sa fermeture", async () => {
    const { user } = setup({ rows: [mine("ex-1", "Tractions"), mine("ex-2", "Gainage")] });

    await user.click(selectAll());
    await user.click(screen.getByRole("button", { name: "library.table.editAccess" }));
    expect(screen.getByText("Tractions, Gainage")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(screen.queryByText("Tractions, Gainage")).not.toBeInTheDocument();
    expect(select().map((box) => (box as HTMLInputElement).checked)).toEqual([true, true]);
  });
});

describe("LibraryTable — limites", () => {
  it("au-delà de ce que l'API accepte, la sélection le dit et ne s'ouvre pas", async () => {
    const rows = [mine("ex-1", "Tractions"), mine("ex-2", "Gainage"), mine("ex-3", "Squat")];
    const { user } = setup({ rows });

    await user.click(selectAll());

    expect(screen.getByText("library.table.tooMany")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "library.table.editAccess" })).toBeDisabled();
  });

  it("des droits absents sur un élément à soi ne s'ouvrent ni ne se cochent", () => {
    setup({ rows: [{ ...mine("ex-1", "Tractions"), grants: null }] });

    // Un « — » pour les tags, un pour l'accès.
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "library.access.private" }),
    ).not.toBeInTheDocument();
    expect(select()[0]).toBeDisabled();
  });

  it("le panneau garde ses éléments si une relecture en retire un", async () => {
    const onOpen = vi.fn();
    const rows = [mine("ex-1", "Tractions"), mine("ex-2", "Gainage")];
    function Harness({ shown }: Readonly<{ shown: LibraryTableRow[] }>) {
      const mutation = useMutation({ mutationFn: async (_: ChangeAccessInput) => [] });
      return (
        <LibraryTable
          rows={shown}
          organizations={[F]}
          copyPrefix="library.access.exercise"
          mutation={mutation}
          onOpen={onOpen}
        />
      );
    }
    const { user, rerender } = renderWithProviders(<Harness shown={rows} />);

    await user.click(selectAll());
    await user.click(screen.getByRole("button", { name: "library.table.editAccess" }));
    rerender(<Harness shown={rows.slice(0, 1)} />);

    expect(screen.getByText("Tractions, Gainage")).toBeInTheDocument();
  });
});

describe("LibraryTable — cellule Accès", () => {
  it("ouvre le panneau de la ligne, et l'enregistrement part pour elle seule", async () => {
    const { user, send } = setup({ rows: [mine("ex-1", "Tractions"), mine("ex-2", "Gainage")] });

    await user.click(
      screen.getAllByRole("button", { name: "library.access.private" })[1] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "library.access.level.READ" }));
    await user.click(screen.getByRole("button", { name: "library.access.save" }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0]).toEqual({
      ids: ["ex-2"],
      changes: [{ organizationId: "org-f", level: AccessLevel.READ }],
    });
  });

  it("sur l'élément d'un autre Coach, le panneau ouvre l'élément", async () => {
    const { user, onOpen } = setup({ rows: [shared] });

    await user.click(screen.getByRole("button", { name: "library.access.sharedBy" }));
    await user.click(screen.getByRole("button", { name: "library.access.exercise.open" }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "ex-9" }));
  });
});
