import {
  AccessLevel,
  ApiError,
  type ChangeAccessInput,
  type CoachOrganizationDto,
  type ElementAccessDto,
  MyAccessLevel,
} from "@cmv/shared";
import { useMutation } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { type AccessElement, AccessPanel } from "./AccessPanel";

const C = { id: "c", name: "C" };
const M = { id: "m", name: "M" };
const F = { id: "org-f", name: "F" };
const G = { id: "org-g", name: "G" };

const ORGANIZATIONS: CoachOrganizationDto[] = [
  {
    id: "org-f",
    name: "F",
    coaches: [
      { coachId: "c", name: "C" },
      { coachId: "m", name: "M" },
    ],
  },
  { id: "org-g", name: "G", coaches: [{ coachId: "c", name: "C" }] },
];

const mine = (
  id: string,
  grants: AccessElement["grants"],
  coachGrants: AccessElement["coachGrants"] = [],
): AccessElement => ({
  id,
  title: `Exercice ${id}`,
  owner: C,
  myAccess: { level: MyAccessLevel.OWNER, via: null },
  grants,
  coachGrants,
});

function setup(
  elements: AccessElement[],
  change: (input: ChangeAccessInput) => Promise<ElementAccessDto[]> = async () => [],
  organizations: CoachOrganizationDto[] = ORGANIZATIONS,
) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onOpen = vi.fn();
  const send = vi.fn(change);
  function Harness() {
    const mutation = useMutation({ mutationFn: send });
    return (
      <AccessPanel
        elements={elements}
        organizations={organizations}
        copyPrefix="library.access.exercise"
        mutation={mutation}
        onClose={onClose}
        onSaved={onSaved}
        onOpen={onOpen}
      />
    );
  }
  return { ...renderWithProviders(<Harness />), onClose, onSaved, onOpen, send };
}

/** La ligne d'une entreprise : son nom, et son sélecteur. */
function row(name: string) {
  const line = screen
    .getByText(name, { selector: "span.text-cmv-body" })
    .closest("div.rounded-cmv-md");
  if (!(line instanceof HTMLElement)) throw new Error(`ligne ${name} introuvable`);
  return within(line);
}

const pressed = (name: string) =>
  row(name)
    .queryAllByRole("button", { pressed: true })
    .map((button) => button.textContent);

describe("AccessPanel — propriétaire", () => {
  it("une ligne par entreprise, sur la valeur de l'élément ; « Aucun » sans ligne de droit", () => {
    setup([mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }])]);

    expect(pressed("F")).toEqual(["library.access.level.WRITE"]);
    expect(pressed("G")).toEqual(["library.access.level.NONE"]);
    expect(screen.getByText("library.access.exercise.mine")).toBeInTheDocument();
  });

  it("la légende rend chaque droit avec son sens, en phrases entières", () => {
    setup([mine("ex-1", [])]);

    const legend = within(
      screen.getByText("library.access.ownerOnly").parentElement as HTMLElement,
    );
    const terms = legend.getAllByRole("term").map((term) => term.textContent);
    const meanings = legend.getAllByRole("definition").map((meaning) => meaning.textContent);
    expect(terms).toEqual(["library.access.level.READ", "library.access.level.WRITE"]);
    expect(meanings).toEqual([
      "library.access.exercise.readMeans",
      "library.access.exercise.writeMeans",
    ]);
  });

  it("rien de changé, rien à enregistrer", () => {
    setup([mine("ex-1", [])]);

    expect(screen.getByRole("button", { name: "library.access.save" })).toBeDisabled();
  });

  it("n'envoie que la ligne changée, le dit enregistré, puis se ferme", async () => {
    const { user, send, onClose, onSaved } = setup([
      mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }]),
    ]);

    await user.click(row("G").getByRole("button", { name: "library.access.level.READ" }));
    await user.click(screen.getByRole("button", { name: "library.access.save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toEqual({
      ids: ["ex-1"],
      changes: [{ organizationId: "org-g", level: AccessLevel.READ }],
      coachChanges: [],
    });
  });

  it("« Aucun » retire la ligne de l'entreprise : null, jamais NONE", async () => {
    const { user, send } = setup([mine("ex-1", [{ organization: F, level: AccessLevel.READ }])]);

    await user.click(row("F").getByRole("button", { name: "library.access.level.NONE" }));
    await user.click(screen.getByRole("button", { name: "library.access.save" }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0].changes).toEqual([{ organizationId: "org-f", level: null }]);
  });

  it("plusieurs éléments : « Mixte » allumé, et laissé tel quel il ne part pas", async () => {
    const { user, send } = setup([
      mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }]),
      mine("ex-2", []),
    ]);

    expect(pressed("F")).toEqual(["library.access.mixed"]);
    expect(screen.getByText("Exercice ex-1, Exercice ex-2")).toBeInTheDocument();

    await user.click(row("G").getByRole("button", { name: "library.access.level.WRITE" }));
    await user.click(screen.getByRole("button", { name: "library.access.exercise.applyTo" }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0]).toEqual({
      ids: ["ex-1", "ex-2"],
      changes: [{ organizationId: "org-g", level: AccessLevel.WRITE }],
      coachChanges: [],
    });
  });

  it("une ligne partie de « Mixte » y revient sans défaire les autres, et ne part pas", async () => {
    const { user, send } = setup([
      mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }]),
      mine("ex-2", []),
    ]);

    await user.click(row("G").getByRole("button", { name: "library.access.level.READ" }));
    await user.click(row("F").getByRole("button", { name: "library.access.level.READ" }));
    await user.click(row("F").getByRole("button", { name: "library.access.mixed" }));

    expect(pressed("F")).toEqual(["library.access.mixed"]);
    expect(pressed("G")).toEqual(["library.access.level.READ"]);
    await user.click(screen.getByRole("button", { name: "library.access.exercise.applyTo" }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0].changes).toEqual([
      { organizationId: "org-g", level: AccessLevel.READ },
    ]);
  });

  it("« Mixte » n'est proposé qu'à la ligne qui l'était", () => {
    setup([mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }]), mine("ex-2", [])]);

    expect(row("F").getByRole("button", { name: "library.access.mixed" })).toBeInTheDocument();
    expect(row("G").queryByRole("button", { name: "library.access.mixed" })).toBeNull();
  });

  it("un refus s'affiche au-dessus des boutons, la saisie gardée (frame 13)", async () => {
    const refusal = "Impossible de réduire cet accès : l'exercice est utilisé dans 2 séance(s)";
    const { user, onClose } = setup(
      [mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }])],
      async () => {
        throw new ApiError(409, refusal, null);
      },
    );

    await user.click(row("F").getByRole("button", { name: "library.access.level.NONE" }));
    await user.click(screen.getByRole("button", { name: "library.access.save" }));

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(pressed("F")).toEqual(["library.access.level.NONE"]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("revenu à son point de départ, le refus s'efface : il ne porte plus sur rien", async () => {
    const refusal = "Impossible de réduire cet accès";
    const { user } = setup(
      [mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }])],
      async () => {
        throw new ApiError(409, refusal, null);
      },
    );

    await user.click(row("F").getByRole("button", { name: "library.access.level.NONE" }));
    await user.click(screen.getByRole("button", { name: "library.access.save" }));
    expect(await screen.findByText(refusal)).toBeInTheDocument();
    await user.click(row("F").getByRole("button", { name: "library.access.level.WRITE" }));

    expect(screen.queryByText(refusal)).toBeNull();
  });

  it("ne se ferme pas tant que l'enregistrement est en vol", async () => {
    let answer: (value: ElementAccessDto[]) => void = () => undefined;
    const { user, onClose } = setup(
      [mine("ex-1", [])],
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    await user.click(row("F").getByRole("button", { name: "library.access.level.READ" }));
    await user.click(screen.getByRole("button", { name: "library.access.save" }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    answer([]);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("dit qui d'autre est dans l'entreprise, ou que le Coach y est seul", () => {
    setup([mine("ex-1", [])]);

    expect(row("F").getByText("library.access.organizationCoaches")).toBeInTheDocument();
    expect(row("G").getByText("library.access.organizationCoaches")).toBeInTheDocument();
  });
});

describe("AccessPanel — lignes des Coachs (#608)", () => {
  const lineOfM = (level: AccessLevel) => [{ coach: M, level }];

  it("M en retrait sous F, en « Hérité », avec le droit qui découle de F", () => {
    setup([mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }])]);

    expect(pressed("M")).toEqual(["library.access.inherited"]);
    expect(row("M").getByText("library.access.coachOf")).toBeInTheDocument();
    expect(row("M").getByText("library.access.via")).toBeInTheDocument();
    // Le propriétaire n'a pas de ligne : rien ne se règle pour lui.
    expect(screen.queryByText("C", { selector: "span.text-cmv-body" })).toBeNull();
  });

  it("le droit hérité suit F à l'instant, et se dit « Aucun » quand rien ne l'ouvre", async () => {
    const { user } = setup([mine("ex-1", [{ organization: F, level: AccessLevel.READ }])]);

    await user.click(row("F").getByRole("button", { name: "library.access.level.NONE" }));

    expect(row("M").queryByText("library.access.via")).toBeNull();
    expect(row("M").getAllByText("library.access.level.NONE")).toHaveLength(2);
  });

  it("« Aucun » sur M part en ligne NONE, sans toucher F", async () => {
    const { user, send } = setup([mine("ex-1", [{ organization: F, level: AccessLevel.WRITE }])]);

    await user.click(row("M").getByRole("button", { name: "library.access.level.NONE" }));
    await user.click(screen.getByRole("button", { name: "library.access.save" }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0]).toEqual({
      ids: ["ex-1"],
      changes: [],
      coachChanges: [{ coachId: "m", level: AccessLevel.NONE }],
    });
  });

  it("une ligne posée s'affiche sans note, et « Hérité » la retire", async () => {
    const { user, send } = setup([mine("ex-1", [], lineOfM(AccessLevel.WRITE))]);

    expect(pressed("M")).toEqual(["library.access.level.WRITE"]);
    expect(row("M").queryByText("library.access.via")).toBeNull();
    await user.click(row("M").getByRole("button", { name: "library.access.inherited" }));
    await user.click(screen.getByRole("button", { name: "library.access.save" }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0]).toEqual({
      ids: ["ex-1"],
      changes: [],
      coachChanges: [{ coachId: "m", level: null }],
    });
  });

  it("sur plusieurs éléments, une ligne de M qui diffère reste « Mixte » et ne part pas", async () => {
    const { user, send } = setup([
      mine("ex-1", [], lineOfM(AccessLevel.READ)),
      mine("ex-2", [{ organization: F, level: AccessLevel.READ }]),
    ]);

    expect(pressed("M")).toEqual(["library.access.mixed"]);
    // F diffère aussi : ce que M hérite change d'un exercice à l'autre.
    await user.click(row("M").getByRole("button", { name: "library.access.inherited" }));
    expect(row("M").getByText("library.access.exercise.inheritsMixed")).toBeInTheDocument();
    await user.click(row("G").getByRole("button", { name: "library.access.level.READ" }));
    await user.click(row("M").getByRole("button", { name: "library.access.mixed" }));
    await user.click(screen.getByRole("button", { name: /library\.access\.exercise\.applyTo/ }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0]).toMatchObject({ coachChanges: [] });
  });

  it("un Coach de deux entreprises n'apparaît qu'une fois, et hérite de la plus large", () => {
    const both: CoachOrganizationDto[] = [
      { id: "org-f", name: "F", coaches: [{ coachId: "m", name: "M" }] },
      { id: "org-g", name: "G", coaches: [{ coachId: "m", name: "M" }] },
    ];
    setup(
      [
        mine("ex-1", [
          { organization: F, level: AccessLevel.READ },
          { organization: G, level: AccessLevel.WRITE },
        ]),
      ],
      async () => [],
      both,
    );

    expect(screen.getAllByText("M", { selector: "span.text-cmv-body" })).toHaveLength(1);
    expect(row("M").getByText("library.access.via")).toBeInTheDocument();
  });
});

describe("AccessPanel — lecture seule", () => {
  const shared: AccessElement = {
    id: "ex-9",
    title: "Lecture de voie",
    owner: M,
    myAccess: { level: MyAccessLevel.WRITE, via: G },
    grants: null,
    coachGrants: null,
  };

  it("dit le propriétaire et le droit de l'acteur, sans aucun sélecteur (frame 7)", async () => {
    const { user, onOpen } = setup([shared]);

    expect(screen.getByText("library.access.exercise.ofOwner")).toBeInTheDocument();
    expect(screen.getByText("library.access.via")).toBeInTheDocument();
    expect(screen.getByText("library.access.exercise.canWrite")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "library.access.level.READ" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "library.access.exercise.open" }));
    expect(onOpen).toHaveBeenCalledWith(shared);
  });

  it("sans provenance, le droit seul", () => {
    setup([{ ...shared, myAccess: { level: MyAccessLevel.READ, via: null } }]);

    expect(screen.getByText("library.access.level.READ")).toBeInTheDocument();
    expect(screen.getByText("library.access.exercise.canRead")).toBeInTheDocument();
  });
});
