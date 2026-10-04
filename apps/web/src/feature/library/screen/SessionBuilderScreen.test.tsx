import {
  AdjustmentLevel,
  ApiError,
  BlockType,
  cellPath,
  type ExerciseBlocks,
  type ExerciseDto,
  type SessionDto,
  structurePath,
} from "@cmv/shared";
import { useSearch } from "@tanstack/react-router";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { describeReorder, dragOnto } from "../../../../test/reorder";
import { SessionBuilderScreen } from "./SessionBuilderScreen";

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  reloadSessionExercise: vi.fn(),
  listExercises: vi.fn(),
  listExerciseTags: vi.fn(),
  listCustomMetrics: vi.fn(),
  getExercise: vi.fn(),
  createExercise: vi.fn(),
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

const TITLE = "library.session.titleLabel";
const NOTES = "library.session.notesLabel";
const SUBMIT_CREATE = "library.session.submitCreate";
const SUBMIT_EDIT = "library.session.submitEdit";
const PICK = "library.session.pickerTitle";
const MENU = "library.session.cardMenu";

/** Un bloc SERIES à une ligne : de quoi ajuster le bandeau ET une cellule. */
const series = (id: string, reps: number) =>
  [
    {
      id,
      label: null,
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
      rows: [{ id: `${id}-r1`, values: { [`${id}-reps`]: reps } }],
    },
  ] as unknown as ExerciseBlocks;

const composed = (
  id: string,
  exerciseId: string,
  title: string,
  blocks = series(`${id}-b`, 6),
) => ({
  id,
  exerciseId,
  title,
  tags: [],
  note: null,
  blocks,
  baseline: blocks,
  adjustments: [],
});

const saved = (over: Partial<SessionDto> = {}) =>
  ({
    id: "s-1",
    title: "Force",
    notes: "Au calme",
    exercises: [
      composed("se-1", "ex-1", "Tractions"),
      composed("se-2", "ex-2", "Gainage"),
      composed("se-3", "ex-3", "Suspensions"),
    ],
    ...over,
  }) as unknown as SessionDto;

const planche = {
  id: "ex-9",
  title: "Planche",
  tags: ["gainage"],
  blocks: series("p-b", 3),
} as unknown as ExerciseDto;

beforeEach(() => {
  vi.clearAllMocks();
  api.getSession.mockResolvedValue(saved());
  api.createSession.mockResolvedValue(saved());
  api.updateSession.mockResolvedValue(saved());
  api.listExercises.mockResolvedValue([planche]);
  api.listExerciseTags.mockResolvedValue([]);
  api.listCustomMetrics.mockResolvedValue([]);
});

const LINKS = [
  "/",
  "/messages",
  "/plans",
  "/invoices",
  "/reminders",
  "/account",
  "/library",
  "/library/exercises/new",
  "/library/exercises/$exerciseId",
];

async function create() {
  const view = await renderInRoute(<SessionBuilderScreen />, {
    path: "/library/sessions/new",
    links: LINKS,
  });
  return withReaders(view);
}

async function edit() {
  const view = await renderInRoute(<SessionBuilderScreen sessionId="s-1" />, {
    path: "/library/sessions/s-1",
    links: LINKS,
  });
  await view.findByRole("button", { name: SUBMIT_EDIT });
  return withReaders(view);
}

function withReaders<V extends Awaited<ReturnType<typeof renderInRoute>>>(view: V) {
  const heading = () => view.getAllByRole("heading", { level: 1 })[0]?.textContent;
  /** La carte d'un exercice de la composition, par son titre — l'aperçu le montre aussi. */
  const card = (title: string) =>
    view.getByRole("button", { name: title, expanded: false }).closest("article") as HTMLElement;
  const openCard = (title: string) =>
    view.user.click(view.getByRole("button", { name: title, expanded: false }));
  const menu = async (title: string, action: string) => {
    await view.user.click(within(card(title)).getByRole("button", { name: MENU }));
    await view.user.click(within(card(title)).getByRole("button", { name: action }));
  };
  /** Ce que l'écran a envoyé au serveur, au dernier enregistrement de la séance. */
  const sent = () => api.updateSession.mock.lastCall?.[1];
  const save = async () => {
    await view.user.click(view.getByRole("button", { name: SUBMIT_EDIT }));
    await waitFor(() => expect(api.updateSession).toHaveBeenCalled());
  };
  return { ...view, heading, card, openCard, menu, sent, save };
}

describe("SessionBuilderScreen — chargement", () => {
  it("dit qu'il charge la séance demandée, sans formulaire", async () => {
    api.getSession.mockReturnValue(new Promise(() => undefined));
    const view = await renderInRoute(<SessionBuilderScreen sessionId="s-1" />, {
      path: "/library/sessions/s-1",
      links: LINKS,
    });

    expect(view.getByText("common.loading")).toBeInTheDocument();
    expect(view.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(
      "library.session.loadingTitle",
    );
    expect(view.queryByRole("textbox", { name: TITLE })).not.toBeInTheDocument();
  });

  it("propose de réessayer quand la séance ne se charge pas", async () => {
    api.getSession.mockRejectedValueOnce(new Error("500"));
    const view = await renderInRoute(<SessionBuilderScreen sessionId="s-1" />, {
      path: "/library/sessions/s-1",
      links: LINKS,
    });

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByRole("textbox", { name: TITLE })).toHaveValue("Force");
    expect(api.getSession).toHaveBeenCalledTimes(2);
  });
});

describe("SessionBuilderScreen — création", () => {
  it("s'ouvre vide, enregistrement fermé tant qu'il n'y a pas de titre", async () => {
    const view = await create();

    expect(view.heading()).toBe("library.session.createTitle");
    expect(view.getByText("library.session.emptyTitle")).toBeInTheDocument();
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeDisabled();
  });

  // Le titre de la page suit la saisie ; tant qu'il n'y en a pas, elle dit ce qu'on crée.
  it("prend le titre saisi pour titre de page, sans ses espaces de bord", async () => {
    const view = await create();

    await view.user.type(view.getByRole("textbox", { name: TITLE }), "  Force du lundi ");

    expect(view.heading()).toBe("Force du lundi");
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeEnabled();
  });

  it("ne réclame le titre qu'une fois le champ quitté vide", async () => {
    const view = await create();

    expect(view.queryByText("library.session.titleRequired")).not.toBeInTheDocument();
    await view.user.type(view.getByRole("textbox", { name: TITLE }), "   ");
    await view.user.tab();

    expect(view.getByText("library.session.titleRequired")).toBeInTheDocument();
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeDisabled();
  });

  it("ajoute l'exercice choisi dans la bibliothèque, puis referme le sélecteur", async () => {
    const view = await create();

    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.user.click(await view.findByRole("button", { name: /Planche/ }));

    expect(view.card("Planche")).toBeInTheDocument();
    expect(view.queryByText("library.session.emptyTitle")).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: PICK })).toBeInTheDocument();
    // Et l'aperçu athlète le montre aussitôt.
    expect(view.getAllByText("Planche").length).toBeGreaterThan(1);
  });

  it("referme le sélecteur sans rien ajouter", async () => {
    const view = await create();

    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.findByRole("button", { name: /Planche/ });
    // Celui du sélecteur : l'en-tête de page porte son propre « Annuler », qui quitte la séance.
    await view.user.click(
      view.getAllByRole("button", { name: "library.builder.cancel" }).at(-1) as HTMLElement,
    );

    expect(view.getByRole("button", { name: PICK })).toBeInTheDocument();
    expect(view.getByText("library.session.emptyTitle")).toBeInTheDocument();
  });

  // Une ligne AJOUTÉE n'a pas d'id : c'est au serveur de poser sa référence (schéma de séance).
  it("crée la séance avec ses exercices ajoutés, sans id de ligne, puis revient à la bibliothèque", async () => {
    const view = await create();

    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force du lundi");
    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.user.click(await view.findByRole("button", { name: /Planche/ }));
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(view.getByText("library.session.saved")).toBeInTheDocument();
    const input = api.createSession.mock.lastCall?.[0];
    expect(input).toEqual({
      title: "Force du lundi",
      notes: null,
      exercises: [{ exerciseId: "ex-9", note: null, blocks: planche.blocks, adjustments: [] }],
    });
    expect(input.exercises[0]).not.toHaveProperty("id");
  });

  it("ferme le rechargement d'un exercice pas encore enregistré", async () => {
    const view = await create();

    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.user.click(await view.findByRole("button", { name: /Planche/ }));
    await view.user.click(within(view.card("Planche")).getByRole("button", { name: MENU }));

    expect(view.getByRole("button", { name: "library.session.reload" })).toBeDisabled();
  });

  it("dit que l'enregistrement tourne, et ferme les actions le temps qu'il finisse", async () => {
    api.createSession.mockReturnValue(new Promise(() => undefined));
    const view = await create();

    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force");
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    expect(await view.findByRole("button", { name: "library.builder.saving" })).toBeDisabled();
    expect(view.getByRole("button", { name: "library.builder.cancel" })).toBeDisabled();
  });

  it("reste sur la page et dit l'échec quand l'enregistrement échoue", async () => {
    api.createSession.mockRejectedValue(new ApiError(400, "Trop d'exercices", null));
    const view = await create();

    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force");
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    expect(await view.findByText("library.session.saveFailed")).toBeInTheDocument();
    // Le message du serveur, lui, reste sous le formulaire.
    expect(view.getByText("Trop d'exercices")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/sessions/new");
  });

  it("renonce sans rien enregistrer, et revient à la bibliothèque", async () => {
    const view = await create();

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.createSession).not.toHaveBeenCalled();
  });
});

describe("SessionBuilderScreen — édition", () => {
  it("s'ouvre sur la séance chargée", async () => {
    const view = await edit();

    expect(view.heading()).toBe("Force");
    expect(view.getByRole("textbox", { name: TITLE })).toHaveValue("Force");
    expect(view.getByRole("textbox", { name: NOTES })).toHaveValue("Au calme");
    expect(view.queryByText("library.session.emptyTitle")).not.toBeInTheDocument();
  });

  it("enregistre la séance entière, ids de ligne compris, puis revient à la bibliothèque", async () => {
    const view = await edit();

    await view.save();

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.updateSession.mock.lastCall?.[0]).toBe("s-1");
    expect(view.sent().exercises.map((row: { id: string }) => row.id)).toEqual([
      "se-1",
      "se-2",
      "se-3",
    ]);
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it.each([
    ["  Doigts frais ", "Doigts frais"],
    ["   ", null],
  ])("envoie les notes « %s » comme %s", async (typed, expected) => {
    const view = await edit();

    await view.user.clear(view.getByRole("textbox", { name: NOTES }));
    await view.user.type(view.getByRole("textbox", { name: NOTES }), typed);
    await view.save();

    expect(view.sent().notes).toBe(expected);
  });

  describeReorder(["Tractions", "Gainage", "Suspensions"], async () => {
    const view = await edit();
    const arrow = (name: string, rank: number) =>
      view.getAllByRole("button", { name })[rank - 1] as HTMLElement;
    const handle = (rank: number) =>
      view.getByRole("button", { name: `library.session.moveExercise ${rank}` });
    return {
      // Les titres des cartes repliées, dans l'ordre du document — l'aperçu les répète ailleurs.
      order: () =>
        view.getAllByRole("button", { expanded: false }).map((button) => button.textContent),
      moveUp: (rank) => view.user.click(arrow("library.session.moveUp", rank)),
      moveDown: (rank) => view.user.click(arrow("library.session.moveDown", rank)),
      drag: (from, to) => dragOnto(handle(from), handle(to)),
    };
  });

  // Le glisser est inaccessible au clavier : la poignée, elle, répond aux flèches.
  it("déplace un exercice au clavier depuis sa poignée", async () => {
    const view = await edit();

    view.getByRole("button", { name: "library.session.moveExercise 3" }).focus();
    await view.user.keyboard("{ArrowUp}");
    await view.save();

    expect(view.sent().exercises.map((row: { id: string }) => row.id)).toEqual([
      "se-1",
      "se-3",
      "se-2",
    ]);
  });

  it("écrit la note sur SON exercice", async () => {
    const view = await edit();

    await view.openCard("Gainage");
    await view.user.type(view.getByRole("textbox", { name: "library.session.noteLabel" }), "Lesté");
    await view.save();

    expect(view.sent().exercises.map((row: { note: string | null }) => row.note)).toEqual([
      null,
      "Lesté",
      null,
    ]);
  });

  it("retire l'exercice désigné, et lui seul", async () => {
    const view = await edit();

    await view.menu("Gainage", "library.session.remove");
    await view.save();

    expect(view.sent().exercises.map((row: { id: string }) => row.id)).toEqual(["se-1", "se-3"]);
  });

  it("ajuste une valeur de SON exercice et la marque ajustée", async () => {
    const view = await edit();

    await view.openCard("Gainage");
    // La première série : les suivantes, fantômes, la reprennent (#520).
    const cell = within(view.getByRole("table")).getAllByRole("textbox")[0] as HTMLElement;
    await view.user.clear(cell);
    await view.user.type(cell, "8");
    await view.user.tab();
    await view.save();

    const [first, second] = view.sent().exercises;
    expect(second.blocks[0].rows[0].values).toEqual({ "se-2-b-reps": 8 });
    expect(second.adjustments).toEqual([
      { path: cellPath("se-2-b", "se-2-b-r1", "se-2-b-reps"), level: AdjustmentLevel.SESSION },
    ]);
    expect(first.adjustments).toEqual([]);
  });

  it("rend une valeur ajustée à son défaut", async () => {
    const adjusted = {
      ...composed("se-1", "ex-1", "Tractions"),
      blocks: series("se-1-b", 8),
      adjustments: [
        { path: cellPath("se-1-b", "se-1-b-r1", "se-1-b-reps"), level: AdjustmentLevel.SESSION },
      ],
    };
    api.getSession.mockResolvedValue(saved({ exercises: [adjusted] } as never));
    const view = await edit();

    await view.openCard("Tractions");
    await view.user.click(
      within(view.getByRole("table")).getByRole("button", { name: "library.session.revert" }),
    );
    await view.save();

    const [row] = view.sent().exercises;
    expect(row.blocks[0].rows[0].values).toEqual({ "se-1-b-reps": 6 });
    expect(row.adjustments).toEqual([]);
  });

  it("ajuste un paramètre du bandeau de SON exercice, et le marque ajusté", async () => {
    const view = await edit();

    await view.openCard("Suspensions");
    fireEvent.change(view.getByRole("spinbutton", { name: "library.builder.bandeau.setCount" }), {
      target: { value: "5" },
    });
    await view.save();

    const [first, , adjusted] = view.sent().exercises;
    expect(adjusted.blocks[0].structure.setCount).toBe(5);
    expect(adjusted.adjustments).toEqual([
      { path: structurePath("se-3-b", "setCount"), level: AdjustmentLevel.SESSION },
    ]);
    expect(first.blocks[0].structure.setCount).toBe(4);
  });

  it("rend un paramètre du bandeau à son défaut", async () => {
    const [block] = series("se-1-b", 6);
    const adjusted = {
      ...composed("se-1", "ex-1", "Tractions"),
      blocks: [{ ...block, structure: { ...block?.structure, setCount: 5 } }],
      adjustments: [{ path: structurePath("se-1-b", "setCount"), level: AdjustmentLevel.SESSION }],
    };
    api.getSession.mockResolvedValue(saved({ exercises: [adjusted] } as never));
    const view = await edit();

    await view.openCard("Tractions");
    await view.user.click(view.getByRole("button", { name: "library.session.revert" }));
    await view.save();

    const [row] = view.sent().exercises;
    expect(row.blocks[0].structure.setCount).toBe(4);
    expect(row.adjustments).toEqual([]);
  });

  // Une Séries n'ajoute pas de ligne : la saisie dans une série fantôme lui en donne une (#520).
  it("donne sa ligne à une série de SON exercice", async () => {
    const view = await edit();

    await view.openCard("Tractions");
    const series2 = within(view.getByRole("table")).getAllByRole("textbox")[1] as HTMLElement;
    await view.user.clear(series2);
    await view.user.type(series2, "8");
    await view.user.tab();
    await view.save();

    expect(
      view.sent().exercises.map((row: { blocks: ExerciseBlocks }) => row.blocks[0]?.rows.length),
    ).toEqual([2, 1, 1]);
  });

  it("réinitialise un exercice ajusté sur sa référence", async () => {
    const adjusted = {
      ...composed("se-2", "ex-2", "Gainage"),
      blocks: series("se-2-b", 9),
      adjustments: [
        { path: cellPath("se-2-b", "se-2-b-r1", "se-2-b-reps"), level: AdjustmentLevel.SESSION },
      ],
    };
    api.getSession.mockResolvedValue(
      saved({ exercises: [composed("se-1", "ex-1", "Tractions"), adjusted] } as never),
    );
    const view = await edit();

    await view.menu("Gainage", "library.session.resetAll");
    await view.save();

    const [, row] = view.sent().exercises;
    expect(row.blocks).toEqual(series("se-2-b", 6));
    expect(row.adjustments).toEqual([]);
  });

  // #300 : la réponse porte toute la séance ENREGISTRÉE — seule la ligne rechargée en est reprise,
  // la note tapée sur une autre et pas encore enregistrée survit.
  it("recharge un exercice depuis la bibliothèque, sans toucher aux autres", async () => {
    const fresh = series("se-2-b", 12);
    api.reloadSessionExercise.mockResolvedValue(
      saved({
        exercises: [
          composed("se-1", "ex-1", "Tractions"),
          { ...composed("se-2", "ex-2", "Gainage"), blocks: fresh, baseline: fresh },
          composed("se-3", "ex-3", "Suspensions"),
        ],
      } as never),
    );
    const view = await edit();
    await view.openCard("Tractions");
    await view.user.type(view.getByRole("textbox", { name: "library.session.noteLabel" }), "Lesté");

    await view.menu("Gainage", "library.session.reload");
    await view.user.click(view.getByRole("button", { name: "library.session.reloadConfirm" }));
    // La valeur rechargée s'affiche : sans ça, le serveur répond et l'écran ne change pas.
    await view.openCard("Gainage");
    // La première série et ses fantômes affichent la même valeur rechargée.
    expect((await view.findAllByDisplayValue("12"))[0]).toBeInTheDocument();
    await view.save();

    expect(api.reloadSessionExercise).toHaveBeenCalledExactlyOnceWith("s-1", "se-2");
    const [first, second] = view.sent().exercises;
    expect(second.blocks).toEqual(fresh);
    expect(first.note).toBe("Lesté");
  });
});

describe("SessionBuilderScreen — retour d'un exercice créé depuis la séance (#303)", () => {
  /** L'écran tel que la route le monte : `add` lu dans l'URL, qui change sous ses pieds. */
  function Routed() {
    const { add } = useSearch({ strict: false }) as { add?: string };
    return <SessionBuilderScreen sessionId="s-1" addExerciseId={add} />;
  }

  async function back() {
    const view = await renderInRoute(<Routed />, {
      path: "/library/sessions/s-1",
      search: { add: "ex-9" },
      links: [...LINKS, "/library/sessions/$sessionId"],
    });
    await view.findByRole("button", { name: SUBMIT_EDIT });
    return withReaders(view);
  }

  it("ajoute l'exercice créé, une seule fois, et le retire de l'url", async () => {
    api.getExercise.mockResolvedValue(planche);
    const view = await back();

    expect(view.card("Planche")).toBeInTheDocument();
    await waitFor(() => expect(view.router.state.location.search).toEqual({}));
    expect(view.getAllByRole("button", { name: "Planche", expanded: false })).toHaveLength(1);
    expect(api.getExercise).toHaveBeenCalledExactlyOnceWith("ex-9");
  });

  it("l'enregistre à la suite de la séance, sans id de ligne", async () => {
    api.getExercise.mockResolvedValue(planche);
    const view = await back();

    await view.save();

    expect(
      view
        .sent()
        .exercises.map((row: { id?: string; exerciseId: string }) => [row.id, row.exerciseId]),
    ).toEqual([
      ["se-1", "ex-1"],
      ["se-2", "ex-2"],
      ["se-3", "ex-3"],
      [undefined, "ex-9"],
    ]);
  });

  it("dit qu'il n'a pas pu ajouter l'exercice introuvable, et garde la séance intacte", async () => {
    api.getExercise.mockRejectedValue(new ApiError(404, "introuvable", null));
    const view = await back();

    expect(await view.findByText("library.session.addCreatedFailed")).toBeInTheDocument();
    await waitFor(() => expect(view.router.state.location.search).toEqual({}));
    expect(
      view.queryByRole("button", { name: "Planche", expanded: false }),
    ).not.toBeInTheDocument();
    expect(view.card("Suspensions")).toBeInTheDocument();
  });

  it("ne cherche aucun exercice sans retour de création", async () => {
    await edit();

    expect(api.getExercise).not.toHaveBeenCalled();
  });
});

describe("SessionBuilderScreen — créer l'exercice manquant (#303)", () => {
  const CREATE_MISSING = "library.noMatch.create";

  /** Cherche un exercice absent de la bibliothèque, puis demande à le créer. */
  async function createMissing(view: Awaited<ReturnType<typeof create>>) {
    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.user.type(await view.findByRole("searchbox"), "Gainage");
    await view.user.click(view.getByRole("button", { name: CREATE_MISSING }));
  }

  // Le cas de l'issue : une séance NEUVE, jamais enregistrée, et rien ne doit s'en perdre.
  it("enregistre la séance neuve, puis ouvre la création en sachant où revenir", async () => {
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force du lundi");
    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.user.click(await view.findByRole("button", { name: /Planche/ }));

    await createMissing(view);

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library/exercises/new"));
    expect(view.router.state.location.search).toEqual({ title: "Gainage", session: "s-1" });
    expect(api.createSession).toHaveBeenCalledExactlyOnceWith({
      title: "Force du lundi",
      notes: null,
      exercises: [{ exerciseId: "ex-9", note: null, blocks: planche.blocks, adjustments: [] }],
    });
    expect(view.getByText("library.session.savedBeforeExercise")).toBeInTheDocument();
  });

  it("enregistre la séance éditée, puis ouvre la création", async () => {
    const view = await edit();

    await createMissing(view);

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library/exercises/new"));
    expect(api.updateSession).toHaveBeenCalledOnce();
    expect(api.createSession).not.toHaveBeenCalled();
  });

  // Sans titre la séance ne peut pas s'enregistrer : rien ne part, le champ le réclame.
  it("n'enregistre rien et réclame le titre quand la séance n'en a pas", async () => {
    const view = await create();

    await createMissing(view);

    expect(view.getByText("library.session.titleRequired")).toBeInTheDocument();
    expect(view.getByText("library.session.titleBeforeLeaving")).toBeInTheDocument();
    expect(api.createSession).not.toHaveBeenCalled();
    expect(view.router.state.location.pathname).toBe("/library/sessions/new");
  });

  it("reste sur la séance et dit l'échec quand elle ne s'enregistre pas", async () => {
    api.createSession.mockRejectedValue(new Error("500"));
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force");

    await createMissing(view);

    expect(await view.findByText("library.session.saveFailed")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/sessions/new");
    expect(view.getByRole("textbox", { name: TITLE })).toHaveValue("Force");
  });

  it("ferme la création le temps de l'enregistrement", async () => {
    api.createSession.mockReturnValue(new Promise(() => undefined));
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force");

    await createMissing(view);

    expect(await view.findByRole("button", { name: CREATE_MISSING })).toBeDisabled();
  });
});

describe("SessionBuilderScreen — dupliquer en variante", () => {
  beforeEach(() => {
    api.getExercise.mockResolvedValue({
      id: "ex-1",
      title: "Tractions",
      description: null,
      instructions: null,
      blocks: series("lib-b", 5),
      tags: ["force"],
    });
    api.createExercise.mockResolvedValue({ id: "ex-new" });
  });

  // Quitter pour l'éditeur d'exercice sans enregistrer ferait perdre la composition en cours.
  it("enregistre la séance, puis ouvre la variante gravée du dosage de la SÉANCE", async () => {
    const view = await edit();

    await view.menu("Tractions", "library.session.duplicate");

    await waitFor(() =>
      expect(view.router.state.location.pathname).toBe("/library/exercises/ex-new"),
    );
    expect(api.updateSession).toHaveBeenCalledOnce();
    expect(api.updateSession.mock.invocationCallOrder[0]).toBeLessThan(
      api.createExercise.mock.invocationCallOrder[0] as number,
    );
    expect(view.getByText("library.session.savedBeforeVariant")).toBeInTheDocument();
    expect(api.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tractions library.session.variantSuffix",
        blocks: series("se-1-b", 6),
        tags: ["force"],
      }),
    );
  });

  // Même garde que la création d'exercice manquant : une séance sans titre ne s'enregistre pas.
  it("ne duplique rien et réclame le titre quand la séance neuve n'en a pas", async () => {
    const view = await create();
    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.user.click(await view.findByRole("button", { name: /Planche/ }));

    await view.menu("Planche", "library.session.duplicate");

    expect(view.getByText("library.session.titleBeforeLeaving")).toBeInTheDocument();
    expect(view.getByText("library.session.titleRequired")).toBeInTheDocument();
    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.createExercise).not.toHaveBeenCalled();
  });

  it("ne duplique rien quand la séance ne s'enregistre pas, et le dit", async () => {
    api.updateSession.mockRejectedValue(new Error("500"));
    const view = await edit();

    await view.menu("Tractions", "library.session.duplicate");

    expect(await view.findByText("library.session.saveFailed")).toBeInTheDocument();
    expect(api.getExercise).not.toHaveBeenCalled();
    expect(api.createExercise).not.toHaveBeenCalled();
    expect(view.router.state.location.pathname).toBe("/library/sessions/s-1");
  });
});

describe("SessionBuilderScreen — saisie non enregistrée (#327)", () => {
  const CANCEL = "library.builder.cancel";
  const STAY = "common.leave.stay";
  const LEAVE = "common.leave.leave";

  it("demande avant d'abandonner une saisie, et « Rester » la garde intacte", async () => {
    const view = await edit();
    const notes = view.getByRole("textbox", { name: NOTES });
    await view.user.type(notes, ", dos droit");

    await view.user.click(view.getByRole("button", { name: CANCEL }));
    await view.user.click(await view.findByRole("button", { name: STAY }));

    await waitFor(() => expect(view.queryByRole("dialog")).not.toBeInTheDocument());
    expect(view.router.state.location.pathname).toBe("/library/sessions/s-1");
    expect(notes).toHaveValue("Au calme, dos droit");
  });

  it("part sans rien enregistrer quand le coach confirme", async () => {
    const view = await create();
    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.user.click(await view.findByRole("button", { name: /Planche/ }));

    await view.user.click(view.getByRole("button", { name: CANCEL }));
    await view.user.click(await view.findByRole("button", { name: LEAVE }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it("laisse partir sans friction une séance ouverte sans être modifiée", async () => {
    const view = await edit();

    await view.user.click(view.getByRole("button", { name: CANCEL }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // L'exercice créé en détour entre dans la séance sans y être enregistré : partir le perdrait.
  it("retient la séance où l'exercice créé vient d'être ajouté", async () => {
    api.getExercise.mockResolvedValue(planche);
    const view = await renderInRoute(
      <SessionBuilderScreen sessionId="s-1" addExerciseId="ex-9" />,
      {
        path: "/library/sessions/s-1",
        links: LINKS,
      },
    );
    await view.findByRole("button", { name: SUBMIT_EDIT });

    await view.user.click(view.getByRole("button", { name: CANCEL }));

    expect(await view.findByRole("dialog")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/sessions/s-1");
  });

  // Le rechargement s'écrit côté serveur : il ne laisse rien en attente.
  it("ne retient pas une séance dont un exercice vient d'être rechargé", async () => {
    const fresh = series("se-2-b", 12);
    api.reloadSessionExercise.mockResolvedValue(
      saved({
        exercises: [
          composed("se-1", "ex-1", "Tractions"),
          { ...composed("se-2", "ex-2", "Gainage"), blocks: fresh, baseline: fresh },
          composed("se-3", "ex-3", "Suspensions"),
        ],
      } as never),
    );
    const view = await edit();
    await view.menu("Gainage", "library.session.reload");
    await view.user.click(view.getByRole("button", { name: "library.session.reloadConfirm" }));
    await view.openCard("Gainage");
    await view.findAllByDisplayValue("12");

    await view.user.click(view.getByRole("button", { name: CANCEL }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // La variante enregistre d'abord : la sortie qui suit n'a plus rien à perdre.
  it("ouvre la variante sans demander, la saisie partie avec la séance", async () => {
    api.getExercise.mockResolvedValue({ ...planche, id: "ex-1", title: "Tractions" });
    api.createExercise.mockResolvedValue({ id: "ex-new" });
    const view = await edit();
    await view.user.type(view.getByRole("textbox", { name: NOTES }), ", dos droit");

    await view.menu("Tractions", "library.session.duplicate");

    await waitFor(() =>
      expect(view.router.state.location.pathname).toBe("/library/exercises/ex-new"),
    );
    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * #566 : une valeur refusée reste à l'écran sans entrer dans le brouillon. Enregistrer — par le
 * bouton, ou par les deux gestes qui enregistrent avant de partir — enverrait l'ancienne.
 */
describe("SessionBuilderScreen — saisie refusée (#566)", () => {
  const REST = "library.builder.bandeau.restBetweenSetsSeconds";
  const BLOCKED = "library.builder.refusedBlocksSave";
  const REFUSED_TOAST = "library.session.refusedBeforeLeaving";

  /** Ouvre « Gainage » et refuse une saisie dans sa première cellule de répétitions. */
  async function refuseCell(view: Awaited<ReturnType<typeof edit>>) {
    await view.openCard("Gainage");
    const cell = within(view.getByRole("table")).getAllByRole("textbox")[0] as HTMLElement;
    await view.user.clear(cell);
    await view.user.type(cell, "12kgg");
    await view.user.tab();
    return cell;
  }

  it("ferme l'enregistrement sur une cellule refusée, qui le dit sous elle", async () => {
    const view = await edit();

    const cell = await refuseCell(view);

    expect(cell).toHaveAccessibleDescription("library.builder.grid.numberInvalid");
    const submit = view.getByRole("button", { name: SUBMIT_EDIT });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("title", BLOCKED);
  });

  it("ferme l'enregistrement sur une durée refusée du bandeau", async () => {
    const view = await edit();
    await view.openCard("Suspensions");

    await view.user.type(view.getByLabelText(REST), "eff");
    await view.user.tab();

    expect(view.getByRole("button", { name: SUBMIT_EDIT })).toBeDisabled();
  });

  it("rouvre l'enregistrement quand la saisie est corrigée, et envoie la valeur corrigée", async () => {
    const view = await edit();
    const cell = await refuseCell(view);

    await view.user.clear(cell);
    await view.user.type(cell, "8");
    await view.user.tab();
    expect(view.getByRole("button", { name: SUBMIT_EDIT })).not.toHaveAttribute("title");
    await view.save();

    expect(view.sent().exercises[1].blocks[0].rows[0].values).toEqual({ "se-2-b-reps": 8 });
  });

  // L'exercice retiré emporte sa cellule : rien ne doit rester fermé derrière lui.
  it("rouvre l'enregistrement quand l'exercice refusé est retiré", async () => {
    const view = await edit();
    await refuseCell(view);
    const card = view
      .getByRole("button", { name: "Gainage", expanded: true })
      .closest("article") as HTMLElement;

    await view.user.click(within(card).getByRole("button", { name: MENU }));
    await view.user.click(within(card).getByRole("button", { name: "library.session.remove" }));

    expect(view.getByRole("button", { name: SUBMIT_EDIT })).toBeEnabled();
  });

  // Ce geste enregistre SANS le bouton, puis quitte la séance : la saisie partirait en silence.
  it("n'enregistre rien avant de créer l'exercice manquant, et dit pourquoi", async () => {
    const view = await edit();
    await refuseCell(view);

    await view.user.click(view.getByRole("button", { name: PICK }));
    await view.user.type(await view.findByRole("searchbox"), "Gainage");
    await view.user.click(view.getByRole("button", { name: "library.noMatch.create" }));

    expect(view.getByText(REFUSED_TOAST)).toBeInTheDocument();
    expect(api.updateSession).not.toHaveBeenCalled();
    expect(view.router.state.location.pathname).toBe("/library/sessions/s-1");
  });

  it("ne duplique rien en variante tant qu'une saisie est refusée", async () => {
    const view = await edit();
    await refuseCell(view);

    await view.menu("Tractions", "library.session.duplicate");

    expect(view.getByText(REFUSED_TOAST)).toBeInTheDocument();
    expect(api.updateSession).not.toHaveBeenCalled();
    expect(api.createExercise).not.toHaveBeenCalled();
  });

  it("demande avant de partir en laissant une saisie refusée", async () => {
    const view = await edit();
    await refuseCell(view);

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));

    expect(await view.findByRole("dialog")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/sessions/s-1");
  });
});
