import {
  ApiError,
  type CustomMetric,
  type ExerciseDto,
  type GridMetric,
  MetricKey,
  MetricSource,
  MetricUnit,
  MetricValueType,
  MyAccessLevel,
  ProblemType,
  SESSION_NOTES_MAX_LENGTH,
  SESSION_TITLE_MAX_LENGTH,
  type SessionBlockDto,
  type SessionDto,
  STRUCTURE_PRESETS,
  StructurePresetKey,
  StructureRepeat,
  type StructureSettings,
} from "@cmv/shared";
import { useSearch } from "@tanstack/react-router";
import { waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { describeReorder, dragOnto } from "../../../../test/reorder";
import { SessionBuilderScreen } from "./SessionBuilderScreen";

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  listExercises: vi.fn(),
  listExerciseTags: vi.fn(),
  listCustomMetrics: vi.fn(),
  getExercise: vi.fn(),
  listMyOrganizations: vi.fn(),
  listStructures: vi.fn(),
  createStructure: vi.fn(),
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
const NOTE = "library.session.noteLabel";
const SUBMIT_CREATE = "library.session.submitCreate";
const SUBMIT_EDIT = "library.session.submitEdit";
const ADD_EXERCISE = "library.session.blocks.addExercise";
const ADD_BLOCK = "library.session.blocks.addBlock";
const BLOCK_MENU = "library.session.blocks.blockMenu";
const EXERCISE_MENU = "library.session.blocks.exerciseMenu";
const ISSUES = "library.session.blocks.issuesBlockSave";

const SERIES: StructureSettings = STRUCTURE_PRESETS[StructurePresetKey.SERIES];

const repsOf = (id: string): GridMetric => ({
  id,
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
});

/** Un exercice de bloc : sa ligne de séance `id`, une colonne de répétitions, une ligne par valeur. */
const exerciseOf = (id: string, exerciseId: string, ...values: number[]) => ({
  id,
  key: `k-${id}`,
  exerciseId,
  note: null,
  grid: {
    metrics: [repsOf(`${id}-reps`)],
    rows: values.map((value, index) => ({
      id: `${id}-r${index + 1}`,
      values: { [`${id}-reps`]: value },
    })),
  },
});

const blockOf = (
  id: string,
  exercises: SessionBlockDto["exercises"],
  settings: StructureSettings = SERIES,
): SessionBlockDto => ({
  id,
  name: "Séries",
  label: null,
  instructions: null,
  settings,
  copiedSettings: settings,
  sourceStructureId: null,
  sourcePreset: StructurePresetKey.SERIES,
  exercises,
});

/** La ligne de séance qui nomme un exercice de bloc, par le même `id`. */
const lineOf = (id: string, exerciseId: string, title: string, over: object = {}) => ({
  id,
  exerciseId,
  title,
  tags: [],
  note: null,
  blocks: [],
  baseline: [],
  adjustments: [],
  customMetrics: [] as CustomMetric[],
  frozenFrom: null,
  ...over,
});

const READ = "2026-10-12T08:00:00.000Z";

/** Force : le bloc A enchaîne Tractions et Gainage, le bloc B porte Suspensions seul. */
const saved = (over: Partial<SessionDto> = {}) =>
  ({
    id: "s-1",
    title: "Force",
    notes: "Au calme",
    owner: { id: "coach-1", name: "Cédric" },
    myAccess: { level: MyAccessLevel.OWNER, via: null },
    grants: [],
    coachGrants: [],
    updatedAt: READ,
    blocks: [
      blockOf("b-1", [exerciseOf("se-1", "ex-1", 6), exerciseOf("se-2", "ex-2", 8)]),
      blockOf("b-2", [exerciseOf("se-3", "ex-3", 5)]),
    ],
    exercises: [
      lineOf("se-1", "ex-1", "Tractions"),
      lineOf("se-2", "ex-2", "Gainage"),
      lineOf("se-3", "ex-3", "Suspensions"),
    ],
    ...over,
  }) as unknown as SessionDto;

const planche = {
  id: "ex-9",
  title: "Planche",
  tags: ["gainage"],
  blocks: [],
  suggestedMetrics: [repsOf("p-reps")],
  customMetrics: [],
  frozenFrom: null,
  owner: { id: "coach-1", name: "Cédric" },
  myAccess: { level: MyAccessLevel.OWNER, via: null },
} as unknown as ExerciseDto;

const library = {
  presets: Object.values(StructurePresetKey).map((key) => ({ key, sessionCount: 0 })),
  structures: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getSession.mockResolvedValue(saved());
  api.createSession.mockResolvedValue(saved());
  api.updateSession.mockResolvedValue(saved());
  api.listExercises.mockResolvedValue([planche]);
  api.listExerciseTags.mockResolvedValue([]);
  api.listCustomMetrics.mockResolvedValue([]);
  api.listMyOrganizations.mockResolvedValue([]);
  api.listStructures.mockResolvedValue(library);
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

const escaped = (text: string) => text.replaceAll(".", "\\.");

type SentBlock = {
  label: string | null;
  instructions: string | null;
  sourcePreset: string | null;
  sourceStructureId: string | null;
  name: string;
  settings: StructureSettings;
  exercises: {
    key: string;
    exerciseId: string;
    note: string | null;
    grid: { rows: { values: object }[] };
  }[];
};

function withReaders<V extends Awaited<ReturnType<typeof renderInRoute>>>(view: V) {
  const heading = () => view.getAllByRole("heading", { level: 1 })[0]?.textContent;
  /** Les cartes de bloc, dans l'ordre : l'aperçu athlète n'en est pas une. */
  const cards = () => [...view.container.querySelectorAll("article")] as HTMLElement[];
  const card = (rank: number) => cards()[rank - 1] as HTMLElement;
  /** Choisit un geste du menu ouvert, par sa clé — l'indication éventuelle suit le libellé. */
  const choose = (name: string) =>
    view.user.click(view.getByRole("menuitem", { name: new RegExp(`^${escaped(name)}`) }));
  const blockMenu = async (rank: number, action: string) => {
    await view.user.click(within(card(rank)).getByRole("button", { name: BLOCK_MENU }));
    await choose(action);
  };
  const exerciseMenu = async (rank: number, exercise: number, action: string) => {
    const menus = within(card(rank)).getAllByRole("button", { name: EXERCISE_MENU });
    await view.user.click(menus[exercise - 1] as HTMLElement);
    await choose(action);
  };
  const pickExercise = async (title = /Planche/) =>
    view.user.click(await view.findByRole("button", { name: title }));
  /** Ce que l'écran a envoyé au serveur, au dernier enregistrement de la séance. */
  const sent = () => api.updateSession.mock.lastCall?.[1];
  const sentBlocks = (): SentBlock[] => sent().blocks;
  const sentIds = () =>
    sentBlocks().map((block) => block.exercises.map((exercise) => exercise.exerciseId));
  const save = async () => {
    await view.user.click(view.getByRole("button", { name: SUBMIT_EDIT }));
    await waitFor(() => expect(api.updateSession).toHaveBeenCalled());
  };
  return {
    ...view,
    heading,
    cards,
    card,
    choose,
    blockMenu,
    exerciseMenu,
    pickExercise,
    sent,
    sentBlocks,
    sentIds,
    save,
  };
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
    // Rien à replier tant qu'il n'y a pas de bloc.
    expect(view.queryByRole("button", { name: "library.session.blocks.compact" })).toBeNull();
  });

  it("borne le titre et la consigne à ce que l'API accepte (#319)", async () => {
    const view = await create();

    expect(view.getByRole("textbox", { name: TITLE })).toHaveAttribute(
      "maxLength",
      String(SESSION_TITLE_MAX_LENGTH),
    );
    expect(view.getByRole("textbox", { name: NOTES })).toHaveAttribute(
      "maxLength",
      String(SESSION_NOTES_MAX_LENGTH),
    );
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

  it("ajoute l'exercice choisi dans un bloc Séries neuf, puis referme le sélecteur", async () => {
    const view = await create();

    await view.user.click(view.getByRole("button", { name: ADD_EXERCISE }));
    expect(view.getByText("library.session.blocks.newSeriesBlock")).toBeInTheDocument();
    await view.pickExercise();

    expect(view.cards()).toHaveLength(1);
    expect(within(view.card(1)).getByText("Planche")).toBeInTheDocument();
    expect(within(view.card(1)).getByText("block.preset.series")).toBeInTheDocument();
    expect(view.queryByText("library.session.emptyTitle")).not.toBeInTheDocument();
    await waitFor(() => expect(view.queryByRole("searchbox")).not.toBeInTheDocument());
    // Et l'aperçu athlète le montre aussitôt.
    expect(view.getAllByText("Planche").length).toBeGreaterThan(1);
  });

  // Une séance neuve se compose par blocs : la composition par exercices part vide.
  it("crée la séance avec ses blocs, puis revient à la bibliothèque", async () => {
    const view = await create();

    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force du lundi");
    await view.user.click(view.getByRole("button", { name: ADD_EXERCISE }));
    await view.pickExercise();
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    // À l'onglet Séances, d'où le coach est parti (#717).
    expect(view.router.state.location.search).toEqual({ tab: "sessions" });
    expect(view.getByText("library.session.saved")).toBeInTheDocument();
    expect(api.createSession.mock.lastCall?.[0]).toEqual({
      title: "Force du lundi",
      notes: null,
      exercises: [],
      blocks: [
        expect.objectContaining({
          name: "block.preset.series",
          label: null,
          sourcePreset: StructurePresetKey.SERIES,
          sourceStructureId: null,
          settings: SERIES,
          // Les colonnes suggérées par l'exercice, sans ligne : chaque tour est un fantôme.
          exercises: [
            {
              key: expect.any(String),
              exerciseId: "ex-9",
              note: null,
              // Une colonne à soi, sous un id neuf : la séance ne partage rien avec l'exercice.
              grid: { metrics: [{ ...repsOf("p-reps"), id: expect.any(String) }], rows: [] },
            },
          ],
        }),
      ],
    });
  });

  it("ajoute un bloc vide, qui retient l'enregistrement tant qu'il le reste", async () => {
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force");

    await view.user.click(view.getByRole("button", { name: ADD_BLOCK }));
    await view.user.click(await view.findByRole("button", { name: /^block\.preset\.emom/ }));

    expect(within(view.card(1)).getByText("library.session.blocks.empty")).toBeInTheDocument();
    expect(within(view.card(1)).getByRole("alert")).toHaveTextContent("block.issue.empty");
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toHaveAttribute("title", ISSUES);

    await view.user.click(within(view.card(1)).getByRole("button", { name: ADD_EXERCISE }));
    expect(view.getByText("library.session.blocks.inBlock")).toBeInTheDocument();
    await view.pickExercise();

    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeEnabled();
    expect(view.cards()).toHaveLength(1);
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
    api.createSession.mockRejectedValue(new ApiError(400, "Trop de blocs", null));
    const view = await create();

    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force");
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    expect(await view.findByText("library.session.saveFailed")).toBeInTheDocument();
    // Le message du serveur, lui, reste sous le formulaire.
    expect(view.getByText("Trop de blocs")).toBeInTheDocument();
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
  it("s'ouvre sur la séance chargée, bloc par bloc", async () => {
    const view = await edit();

    expect(view.heading()).toBe("Force");
    expect(view.getByRole("textbox", { name: TITLE })).toHaveValue("Force");
    expect(view.cards()).toHaveLength(2);
    expect(within(view.card(1)).getByText("A1")).toBeInTheDocument();
    expect(within(view.card(1)).getByText("Tractions")).toBeInTheDocument();
    expect(within(view.card(1)).getByText("Gainage")).toBeInTheDocument();
    expect(within(view.card(2)).getByText("Suspensions")).toBeInTheDocument();
  });

  it("enregistre la séance entière, clés comprises, à la version lue, puis revient", async () => {
    const view = await edit();

    await view.save();

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.updateSession.mock.lastCall?.[0]).toBe("s-1");
    expect(view.sent().expectedUpdatedAt).toBe(READ);
    expect(view.sentBlocks().map((block) => block.exercises.map(({ key }) => key))).toEqual([
      ["k-se-1", "k-se-2"],
      ["k-se-3"],
    ]);
    // Les tours fantômes ne partent pas : ils ne sont que la dernière ligne, répétée.
    expect(view.sentBlocks()[0]?.exercises[0]?.grid.rows).toHaveLength(1);
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

  describe("ordre des blocs", () => {
    describeReorder(["Tractions", "Gainage", "Suspensions"], async () => {
      api.getSession.mockResolvedValue(
        saved({
          blocks: [
            blockOf("b-1", [exerciseOf("se-1", "ex-1", 6)]),
            blockOf("b-2", [exerciseOf("se-2", "ex-2", 8)]),
            blockOf("b-3", [exerciseOf("se-3", "ex-3", 5)]),
          ],
        }),
      );
      const view = await edit();
      const handle = (rank: number) =>
        view.getAllByRole("button", { name: "library.session.blocks.moveBlock" })[
          rank - 1
        ] as HTMLElement;
      const press = async (rank: number, key: string) => {
        handle(rank).focus();
        await view.user.keyboard(key);
      };
      return {
        // Seul dans son bloc, l'exercice se nomme en tête de carte.
        order: () =>
          view
            .cards()
            .map((card) => card.querySelector("header .text-cmv-body")?.textContent ?? null),
        moveUp: (rank) => press(rank, "{ArrowUp}"),
        moveDown: (rank) => press(rank, "{ArrowDown}"),
        drag: (from, to) => dragOnto(handle(from), handle(to)),
      };
    });
  });

  // Le glisser est inaccessible au clavier : la poignée, elle, répond aux flèches.
  it("déplace un exercice dans son bloc au clavier depuis sa poignée", async () => {
    const view = await edit();

    within(view.card(1))
      .getAllByRole("button", { name: "library.session.blocks.moveExercise" })[1]
      ?.focus();
    await view.user.keyboard("{ArrowUp}");
    await view.save();

    expect(view.sentIds()).toEqual([["ex-2", "ex-1"], ["ex-3"]]);
  });

  it("glisse un exercice sur celui d'un autre bloc, qui lui cède sa place", async () => {
    const view = await edit();
    const handles = within(view.card(1)).getAllByRole("button", {
      name: "library.session.blocks.moveExercise",
    });

    // Sur sa grille : seul dans son bloc, Suspensions porte son titre en tête de carte.
    dragOnto(handles[0] as HTMLElement, within(view.card(2)).getByRole("table"));
    await view.save();

    expect(view.sentIds()).toEqual([["ex-2"], ["ex-1", "ex-3"]]);
  });

  it("glisse un exercice au bout d'un autre bloc", async () => {
    const view = await edit();
    const handles = within(view.card(1)).getAllByRole("button", {
      name: "library.session.blocks.moveExercise",
    });

    dragOnto(
      handles[0] as HTMLElement,
      within(view.card(2)).getByRole("button", { name: "library.session.blocks.addToArriving" }),
    );
    await view.save();

    expect(view.sentIds()).toEqual([["ex-2"], ["ex-3", "ex-1"]]);
  });

  it("déplace un exercice vers un autre bloc par son menu", async () => {
    const view = await edit();

    await view.exerciseMenu(1, 1, "library.session.blocks.moveTo");
    await view.save();

    expect(view.sentIds()).toEqual([["ex-2"], ["ex-3", "ex-1"]]);
  });

  // Un bloc vidé par un déplacement n'a plus rien à porter : il part avec son dernier exercice.
  it("emporte le bloc que son dernier exercice quitte", async () => {
    const view = await edit();

    await view.blockMenu(2, "library.session.blocks.moveTo");

    expect(view.cards()).toHaveLength(1);
    await view.save();
    expect(view.sentIds()).toEqual([["ex-1", "ex-2", "ex-3"]]);
  });

  it("sort un exercice en bloc à part, juste après le sien", async () => {
    const view = await edit();

    await view.exerciseMenu(1, 2, "library.session.blocks.detach");
    await view.save();

    expect(view.sentIds()).toEqual([["ex-1"], ["ex-2"], ["ex-3"]]);
  });

  it("duplique un exercice dans son bloc, sous une clé neuve", async () => {
    const view = await edit();

    await view.exerciseMenu(1, 1, "library.session.blocks.duplicateExercise");

    expect(within(view.card(1)).getAllByText("Tractions")).toHaveLength(2);
    await view.save();
    expect(view.sentIds()).toEqual([["ex-1", "ex-1", "ex-2"], ["ex-3"]]);
    const keys = view.sentBlocks()[0]?.exercises.map(({ key }) => key) ?? [];
    expect(new Set(keys).size).toBe(3);
  });

  it("duplique un bloc juste après lui, titres compris", async () => {
    const view = await edit();

    await view.blockMenu(1, "library.session.blocks.duplicateBlock");

    expect(view.cards()).toHaveLength(3);
    expect(within(view.card(2)).getByText("Tractions")).toBeInTheDocument();
    await view.save();
    expect(view.sentIds()).toEqual([["ex-1", "ex-2"], ["ex-1", "ex-2"], ["ex-3"]]);
  });

  it("retire l'exercice désigné, et lui seul", async () => {
    const view = await edit();

    await view.exerciseMenu(1, 2, "library.session.blocks.removeExercise");
    await view.save();

    expect(view.sentIds()).toEqual([["ex-1"], ["ex-3"]]);
  });

  it("supprime un bloc et ses exercices", async () => {
    const view = await edit();

    await view.blockMenu(2, "library.session.blocks.deleteBlock");
    await view.save();

    expect(view.sentIds()).toEqual([["ex-1", "ex-2"]]);
  });

  it("remplace un exercice en gardant sa grille et sa place", async () => {
    const view = await edit();

    await view.exerciseMenu(1, 1, "library.session.blocks.replace");
    expect(view.getByText("library.session.blocks.replaceTitle")).toBeInTheDocument();
    await view.pickExercise();

    expect(within(view.card(1)).queryByText("Tractions")).not.toBeInTheDocument();
    expect(within(view.card(1)).getByText("Planche")).toBeInTheDocument();
    await view.save();
    const [replaced] = view.sentBlocks()[0]?.exercises ?? [];
    expect(replaced?.exerciseId).toBe("ex-9");
    expect(replaced?.key).not.toBe("k-se-1");
    expect(replaced?.grid.rows).toEqual([{ id: "se-1-r1", values: { "se-1-reps": 6 } }]);
  });

  // Un fantôme n'est que la dernière ligne répétée : y écrire en fait une ligne propre.
  it("fait d'un tour fantôme une ligne quand on y écrit", async () => {
    const view = await edit();
    const table = within(view.card(1)).getAllByRole("table")[0] as HTMLElement;
    const ghost = within(table).getAllByRole("textbox")[1] as HTMLElement;

    await view.user.clear(ghost);
    await view.user.type(ghost, "7");
    await view.user.tab();
    await view.save();

    const rows = view.sentBlocks()[0]?.exercises[0]?.grid.rows ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[1]?.values).toEqual({ "se-1-reps": 7 });
  });

  it("écrit la note sur SON exercice", async () => {
    const view = await edit();

    await view.user.type(view.getAllByRole("textbox", { name: NOTE })[1] as HTMLElement, "Lent");
    await view.save();

    expect(view.sentBlocks()[0]?.exercises.map(({ note }) => note)).toEqual([null, "Lent"]);
  });

  it("règle le bloc dans son panneau, qui ne change rien sans « Appliquer »", async () => {
    const view = await edit();
    const tag = () => within(view.card(1)).getByRole("button", { name: "Séries" });

    await view.user.click(tag());
    await view.user.type(view.getByRole("textbox", { name: "library.session.blocks.label" }), "X");
    await view.user.click(view.getByRole("button", { name: "common.cancel" }));
    await view.user.click(tag());
    await view.user.type(
      view.getByRole("textbox", { name: "library.session.blocks.label" }),
      "Échauffement",
    );
    await view.user.click(view.getByRole("button", { name: "library.session.blocks.apply" }));
    await view.save();

    expect(view.sentBlocks().map(({ label }) => label)).toEqual(["Échauffement", null]);
  });

  it("change la structure d'un bloc en gardant ses exercices", async () => {
    const view = await edit();

    await view.blockMenu(1, "library.session.blocks.changeStructure");
    await view.user.click(await view.findByRole("button", { name: /^block\.preset\.emom/ }));
    await view.save();

    const [changed] = view.sentBlocks();
    expect(changed?.sourcePreset).toBe(StructurePresetKey.EMOM);
    expect(changed?.settings).toEqual(STRUCTURE_PRESETS[StructurePresetKey.EMOM]);
    expect(view.sentIds()[0]).toEqual(["ex-1", "ex-2"]);
  });

  // La consigne copiée de la structure quittée n'est pas celle du Coach : elle part avec elle.
  it("change la consigne tenue de la structure quittée, garde celle que le Coach a écrite", async () => {
    const structureOf = (id: string, name: string, instructions: string) => ({
      id,
      name,
      tags: [],
      note: null,
      instructions,
      settings: SERIES,
      sessionCount: 1,
      createdAt: READ,
      updatedAt: READ,
    });
    api.listStructures.mockResolvedValue({
      ...library,
      structures: [
        structureOf("st-1", "Tempo", "3 s en descente"),
        structureOf("st-2", "Explosif", "Pousse vite"),
      ],
    });
    const fromTempo = (
      id: string,
      instructions: string,
      exercises: SessionBlockDto["exercises"],
    ) => ({
      ...blockOf(id, exercises),
      name: "Tempo",
      instructions,
      sourceStructureId: "st-1",
      sourcePreset: null,
    });
    api.getSession.mockResolvedValue(
      saved({
        blocks: [
          fromTempo("b-1", "3 s en descente", [exerciseOf("se-1", "ex-1", 6)]),
          fromTempo("b-2", "Coudes serrés", [exerciseOf("se-3", "ex-3", 5)]),
        ],
      }),
    );
    const view = await edit();

    for (const rank of [1, 2]) {
      await view.blockMenu(rank, "library.session.blocks.changeStructure");
      // Le choix s'affiche après les cartes, dont l'étiquette peut déjà dire « Explosif ».
      const choices = await view.findAllByRole("button", { name: /^Explosif/ });
      await view.user.click(choices.at(-1) as HTMLElement);
    }
    await view.save();

    expect(view.sentBlocks().map(({ instructions }) => instructions)).toEqual([
      "Pousse vite",
      "Coudes serrés",
    ]);
  });

  it("signale les lignes au-delà des tours, et les retire à l'enregistrement", async () => {
    const twoRounds = { ...SERIES, repeat: { kind: StructureRepeat.ROUNDS, rounds: 2 } };
    api.getSession.mockResolvedValue(
      saved({ blocks: [blockOf("b-1", [exerciseOf("se-1", "ex-1", 6, 7, 8)], twoRounds)] }),
    );
    const view = await edit();

    expect(view.getByText("library.session.blocks.beyondNotice")).toBeInTheDocument();
    expect(view.getAllByText("library.session.blocks.beyond")).toHaveLength(1);
    // L'aperçu lit ce que l'athlète recevra : deux séries, pas la ligne en trop.
    const sets = within(
      view.getByRole("complementary", { name: "library.session.blocks.previewTitle" }),
    )
      .getAllByRole("listitem")
      .filter((item) => item.textContent?.startsWith("block.grid.set"));
    expect(sets).toHaveLength(2);
    await view.save();

    expect(view.sentBlocks()[0]?.exercises[0]?.grid.rows).toHaveLength(2);
  });

  it("enregistre un bloc comme structure, que le bloc prend aussitôt", async () => {
    api.createStructure.mockResolvedValue({
      id: "st-1",
      name: "Mon circuit",
      tags: [],
      note: null,
      instructions: null,
      settings: SERIES,
      sessionCount: 0,
      createdAt: READ,
      updatedAt: READ,
    });
    const view = await edit();

    await view.blockMenu(1, "library.session.blocks.saveAsStructure");
    await view.user.type(
      await view.findByRole("textbox", { name: "library.structure.nameLabel" }),
      "Mon circuit",
    );
    await view.user.click(view.getByRole("button", { name: "library.structure.submitCreate" }));

    await waitFor(() =>
      expect(api.createStructure).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Mon circuit", settings: SERIES }),
      ),
    );
    await waitFor(() =>
      expect(within(view.card(1)).getByRole("button", { name: "Mon circuit" })).toBeInTheDocument(),
    );
    await view.save();
    expect(view.sentBlocks()[0]).toMatchObject({ sourceStructureId: "st-1", sourcePreset: null });
  });

  it("replie grilles et notes en affichage compact", async () => {
    const view = await edit();

    await view.user.click(view.getByRole("button", { name: "library.session.blocks.compact" }));

    expect(view.queryAllByRole("table")).toHaveLength(0);
    expect(view.queryAllByRole("textbox", { name: NOTE })).toHaveLength(0);
    expect(within(view.card(1)).getByText("Gainage")).toBeInTheDocument();
  });

  // Seul dans son bloc, l'exercice ne se retire pas : le bloc vide retiendrait l'enregistrement.
  it("fond les gestes d'un exercice seul dans le menu de son bloc", async () => {
    const view = await edit();

    expect(within(view.card(2)).queryByRole("button", { name: EXERCISE_MENU })).toBeNull();
    await view.user.click(within(view.card(2)).getByRole("button", { name: BLOCK_MENU }));

    const items = view.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(
      expect.arrayContaining([
        "library.session.blocks.replace",
        "library.session.blocks.duplicateExercise",
        "library.session.blocks.deleteBlock",
      ]),
    );
    expect(items).not.toContain("library.session.blocks.removeExercise");
    expect(items.some((item) => item?.startsWith("library.session.blocks.detach"))).toBe(false);
  });
});

describe("SessionBuilderScreen — conflit d'édition (#604)", () => {
  const LATEST = "2026-10-12T08:03:00.000Z";
  const STALE = "library.session.stale";
  const RELOAD = "common.staleReload";
  const stale = () => new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE);

  async function editThenConflict() {
    api.updateSession.mockRejectedValueOnce(stale());
    const view = await edit();
    const title = view.getByRole("textbox", { name: TITLE });
    await view.user.clear(title);
    await view.user.type(title, "Force max");
    await view.user.click(view.getByRole("button", { name: SUBMIT_EDIT }));
    await view.findByText(STALE);
    return view;
  }

  it("garde la saisie et le dit par le bandeau, sans toast ni code brut", async () => {
    const view = await editThenConflict();

    expect(view.getByRole("textbox", { name: TITLE })).toHaveValue("Force max");
    expect(view.queryByText("library.session.saveFailed")).not.toBeInTheDocument();
    expect(view.queryByText("Conflit")).not.toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/sessions/s-1");
  });

  it("« Recharger » remplace la saisie par la dernière version, que l'enregistrement cite", async () => {
    const view = await editThenConflict();
    api.getSession.mockResolvedValue(saved({ title: "Force (M)", updatedAt: LATEST }));

    await view.user.click(view.getByRole("button", { name: RELOAD }));

    await waitFor(() =>
      expect(view.getByRole("textbox", { name: TITLE })).toHaveValue("Force (M)"),
    );
    expect(view.queryByText(STALE)).not.toBeInTheDocument();

    await view.user.click(view.getByRole("button", { name: SUBMIT_EDIT }));
    await waitFor(() =>
      expect(api.updateSession).toHaveBeenLastCalledWith(
        "s-1",
        expect.objectContaining({ expectedUpdatedAt: LATEST }),
      ),
    );
  });

  it("garde la saisie et le bandeau quand la relecture échoue", async () => {
    const view = await editThenConflict();
    api.getSession.mockRejectedValue(new Error("réseau"));
    const readsBefore = api.getSession.mock.calls.length;

    await view.user.click(view.getByRole("button", { name: RELOAD }));

    await waitFor(() => expect(api.getSession).toHaveBeenCalledTimes(readsBefore + 1));
    await waitFor(() => expect(view.getByRole("button", { name: RELOAD })).toBeEnabled());
    expect(view.getByText(STALE)).toBeInTheDocument();
    expect(view.getByRole("textbox", { name: TITLE })).toHaveValue("Force max");
    // Sans un mot, le bouton se rouvrirait et rien ne dirait pourquoi la saisie n'a pas bougé.
    expect(await view.findByText("common.staleReloadFailed")).toBeInTheDocument();
  });
});

describe("SessionBuilderScreen — retour d'un exercice créé depuis la séance (#303)", () => {
  /** L'écran tel que la route le monte : `add` et `block` lus dans l'URL, qui change sous ses pieds. */
  function Routed() {
    const { add, block } = useSearch({ strict: false }) as { add?: string; block?: number };
    return <SessionBuilderScreen sessionId="s-1" addExerciseId={add} addToBlock={block} />;
  }

  async function back(search: Record<string, string> = { add: "ex-9" }) {
    const view = await renderInRoute(<Routed />, {
      path: "/library/sessions/s-1",
      search,
      links: [...LINKS, "/library/sessions/$sessionId"],
    });
    await view.findByRole("button", { name: SUBMIT_EDIT });
    return withReaders(view);
  }

  it("ajoute l'exercice créé dans un bloc neuf, une seule fois, et le retire de l'url", async () => {
    api.getExercise.mockResolvedValue(planche);
    const view = await back();

    expect(view.cards()).toHaveLength(3);
    expect(within(view.card(3)).getByText("Planche")).toBeInTheDocument();
    await waitFor(() => expect(view.router.state.location.search).toEqual({}));
    expect(view.cards()).toHaveLength(3);
    expect(api.getExercise).toHaveBeenCalledExactlyOnceWith("ex-9");
  });

  it("l'ajoute au bout du bloc d'où le coach est parti", async () => {
    api.getExercise.mockResolvedValue(planche);
    const view = await back({ add: "ex-9", block: "1" });

    await view.save();

    expect(view.sentIds()).toEqual([
      ["ex-1", "ex-2"],
      ["ex-3", "ex-9"],
    ]);
  });

  it("dit qu'il n'a pas pu ajouter l'exercice introuvable, et garde la séance intacte", async () => {
    api.getExercise.mockRejectedValue(new ApiError(404, "introuvable", null));
    const view = await back();

    expect(await view.findByText("library.session.addCreatedFailed")).toBeInTheDocument();
    await waitFor(() => expect(view.router.state.location.search).toEqual({}));
    expect(view.queryByText("Planche")).not.toBeInTheDocument();
    expect(view.cards()).toHaveLength(2);
  });

  it("ne cherche aucun exercice sans retour de création", async () => {
    await edit();

    expect(api.getExercise).not.toHaveBeenCalled();
  });
});

describe("SessionBuilderScreen — créer l'exercice manquant (#303)", () => {
  const CREATE_MISSING = "library.noMatch.create";

  /** Cherche un exercice absent de la bibliothèque, puis demande à le créer. */
  async function createMissing(view: Awaited<ReturnType<typeof create>>, from?: HTMLElement) {
    await view.user.click(from ?? view.getByRole("button", { name: ADD_EXERCISE }));
    await view.user.type(await view.findByRole("searchbox"), "Gainage");
    await view.user.click(view.getByRole("button", { name: CREATE_MISSING }));
  }

  // Le cas de l'issue : une séance NEUVE, jamais enregistrée, et rien ne doit s'en perdre.
  it("enregistre la séance neuve, puis ouvre la création en sachant où revenir", async () => {
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Force du lundi");
    await view.user.click(view.getByRole("button", { name: ADD_EXERCISE }));
    await view.pickExercise();

    await createMissing(view);

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library/exercises/new"));
    expect(view.router.state.location.search).toEqual({ title: "Gainage", session: "s-1" });
    expect(api.createSession).toHaveBeenCalledOnce();
    expect(view.getByText("library.session.savedBeforeExercise")).toBeInTheDocument();
  });

  // Les ids des blocs changent à l'enregistrement : le bloc voyage par son rang.
  it("ouvert depuis un bloc, emporte son rang", async () => {
    const view = await edit();

    await createMissing(
      view,
      within(view.card(2)).getByRole("button", { name: "library.session.blocks.addToArriving" }),
    );

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library/exercises/new"));
    expect(view.router.state.location.search).toEqual({
      title: "Gainage",
      session: "s-1",
      block: 1,
    });
    expect(api.updateSession).toHaveBeenCalledOnce();
  });

  // L'exercice créé revient AJOUTÉ au bloc : il ne remplacerait pas celui qu'on visait.
  it("ne propose pas de créer l'exercice manquant pour en remplacer un", async () => {
    const view = await edit();

    await view.exerciseMenu(1, 1, "library.session.blocks.replace");
    await view.user.type(await view.findByRole("searchbox"), "Gainage");

    expect(view.getByText("library.noMatch.title")).toBeInTheDocument();
    expect(view.queryByRole("button", { name: CREATE_MISSING })).toBeNull();
  });

  // Sans titre la séance ne peut pas s'enregistrer : rien ne part, le champ le réclame.
  it("n'enregistre rien et réclame le titre quand la séance n'en a pas", async () => {
    const view = await create();

    await createMissing(view);

    // Deux fois : sous le champ, et par le toast qui dit pourquoi rien n'est parti.
    expect(view.getAllByText("library.session.titleRequired")).toHaveLength(2);
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

describe("SessionBuilderScreen — saisie non enregistrée (#327)", () => {
  const CANCEL = "library.builder.cancel";
  const STAY = "common.leave.cancel";
  const LEAVE = "common.leave.discard";
  const SAVE = "common.leave.save";

  it("demande avant d'abandonner une saisie, et « Annuler » la garde intacte", async () => {
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
    await view.user.click(view.getByRole("button", { name: ADD_EXERCISE }));
    await view.pickExercise();

    await view.user.click(view.getByRole("button", { name: CANCEL }));
    await view.user.click(await view.findByRole("button", { name: LEAVE }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.createSession).not.toHaveBeenCalled();
  });

  // #682 : garder son travail ET partir, d'un geste.
  it("enregistre, puis part là où le coach allait", async () => {
    const view = await edit();
    await view.user.type(view.getByRole("textbox", { name: NOTES }), ", dos droit");

    await view.user.click(view.getByRole("button", { name: CANCEL }));
    await view.user.click(await view.findByRole("button", { name: SAVE }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(view.sent().notes).toBe("Au calme, dos droit");
    expect(await view.findByText("library.session.saved")).toBeInTheDocument();
  });

  it("laisse partir sans friction une séance ouverte sans être modifiée", async () => {
    const view = await edit();

    await view.user.click(view.getByRole("button", { name: CANCEL }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Une ligne au-delà des tours ne part pas : la retirer à l'enregistrement n'est pas une saisie.
  it("laisse partir une séance dont seules des lignes non jouées dépassent", async () => {
    const twoRounds = { ...SERIES, repeat: { kind: StructureRepeat.ROUNDS, rounds: 2 } };
    api.getSession.mockResolvedValue(
      saved({ blocks: [blockOf("b-1", [exerciseOf("se-1", "ex-1", 6, 7)], twoRounds)] }),
    );
    const view = await edit();

    await view.user.click(view.getByRole("button", { name: CANCEL }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
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
});

/**
 * #566 : une valeur refusée reste à l'écran sans entrer dans le brouillon. Enregistrer — par le
 * bouton, ou par le geste qui enregistre avant de partir — enverrait l'ancienne.
 */
describe("SessionBuilderScreen — saisie refusée (#566)", () => {
  const BLOCKED = "library.builder.refusedBlocksSave";

  /** Refuse une saisie dans la première cellule de Tractions. */
  async function refuseCell(view: Awaited<ReturnType<typeof edit>>) {
    const table = within(view.card(1)).getAllByRole("table")[0] as HTMLElement;
    const cell = within(table).getAllByRole("textbox")[0] as HTMLElement;
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

  it("rouvre l'enregistrement quand la saisie est corrigée, et envoie la valeur corrigée", async () => {
    const view = await edit();
    const cell = await refuseCell(view);

    await view.user.clear(cell);
    await view.user.type(cell, "8");
    await view.user.tab();
    expect(view.getByRole("button", { name: SUBMIT_EDIT })).not.toHaveAttribute("title");
    await view.save();

    expect(view.sentBlocks()[0]?.exercises[0]?.grid.rows[0]?.values).toEqual({ "se-1-reps": 8 });
  });

  // L'exercice retiré emporte sa cellule : rien ne doit rester fermé derrière lui.
  it("rouvre l'enregistrement quand l'exercice refusé est retiré", async () => {
    const view = await edit();
    await refuseCell(view);

    await view.exerciseMenu(1, 1, "library.session.blocks.removeExercise");

    expect(view.getByRole("button", { name: SUBMIT_EDIT })).toBeEnabled();
  });

  it("demande avant de partir en laissant une saisie refusée", async () => {
    const view = await edit();
    await refuseCell(view);

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));

    expect(await view.findByRole("dialog")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/sessions/s-1");
  });
});

describe("SessionBuilderScreen — suppression", () => {
  const DELETE = "library.session.deleteSession";

  it("une séance qui naît ne se supprime pas", async () => {
    const view = await create();

    expect(view.queryByRole("button", { name: DELETE })).not.toBeInTheDocument();
  });

  it("supprime la séance après confirmation, à la version lue, et revient à la bibliothèque", async () => {
    api.deleteSession.mockResolvedValue(undefined);
    const view = await edit();
    // Une saisie en cours ne retient pas : supprimer, c'est renoncer à la séance entière.
    await view.user.type(view.getByRole("textbox", { name: TITLE }), " max");

    await view.user.click(view.getByRole("button", { name: DELETE }));
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.deleteSession).toHaveBeenCalledWith("s-1", { expectedUpdatedAt: READ });
  });

  it("une suppression qui trouve la séance changée le dit par le bandeau, qui la recharge", async () => {
    api.deleteSession.mockRejectedValue(
      new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE),
    );
    const view = await edit();

    await view.user.click(view.getByRole("button", { name: DELETE }));
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    expect(await view.findByText("library.session.staleDelete")).toBeInTheDocument();
    // Une seule fois : le bandeau, pas un second message sous les actions.
    expect(view.queryByText("common.staleWrite")).not.toBeInTheDocument();
    expect(view.queryByText("Conflit")).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: "common.staleReload" })).toBeInTheDocument();
  });

  it("dit pourquoi la suppression est refusée, et reste sur la séance", async () => {
    api.deleteSession.mockRejectedValue(new ApiError(409, "Séance modifiée entre-temps", null));
    const view = await edit();

    await view.user.click(view.getByRole("button", { name: DELETE }));
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    expect(await view.findByText("Séance modifiée entre-temps")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/sessions/s-1");
  });
});

describe("SessionBuilderScreen — séance d'un autre Coach (#606)", () => {
  const prises: CustomMetric = {
    id: "cm-m",
    label: "Prises",
    unit: null,
    valueType: MetricValueType.NUMBER,
    scale: null,
  };
  /** Un exercice de M, dont la colonne cite le catalogue de M : le lecteur ne l'a pas. */
  const ofMExercise = {
    id: "se-9",
    key: "k-se-9",
    exerciseId: "ex-m",
    note: null,
    grid: {
      metrics: [{ id: "c-m", label: null, source: MetricSource.CUSTOM, customMetricId: "cm-m" }],
      rows: [{ id: "r-m", values: { "c-m": 12 } }],
    },
  };
  const ofM = (level: MyAccessLevel) =>
    saved({
      owner: { id: "coach-m", name: "M" },
      myAccess: { level, via: { id: "org-f", name: "F" } },
      grants: null,
      coachGrants: null,
      blocks: [
        blockOf("b-1", [exerciseOf("se-1", "ex-1", 6)]),
        blockOf("b-2", [ofMExercise] as SessionBlockDto["exercises"]),
      ],
      exercises: [
        lineOf("se-1", "ex-1", "Tractions"),
        lineOf("se-9", "ex-m", "Pan Güllich", { customMetrics: [prises] }),
      ],
    } as unknown as Partial<SessionDto>);

  /** Ouvre la séance de M — en Lecture, il n'y a pas le bouton d'enregistrement qu'attend `edit()`. */
  async function openOfM(session: SessionDto) {
    api.getSession.mockResolvedValue(session);
    const view = withReaders(
      await renderInRoute(<SessionBuilderScreen sessionId="s-1" />, {
        path: "/library/sessions/s-1",
        links: LINKS,
      }),
    );
    await view.findByText("library.session.ofOwner");
    return view;
  }

  it("en Lecture : figée, un bandeau qui dit pourquoi, et « Fermer » seul", async () => {
    const view = await openOfM(ofM(MyAccessLevel.READ));

    expect(view.getByRole("textbox", { name: TITLE })).toBeDisabled();
    expect(view.getByRole("textbox", { name: NOTES })).toBeDisabled();
    for (const name of [
      SUBMIT_EDIT,
      "library.session.deleteSession",
      ADD_EXERCISE,
      ADD_BLOCK,
      BLOCK_MENU,
      "library.session.blocks.moveBlock",
    ]) {
      expect(view.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(within(view.card(1)).getByRole("button", { name: "Séries" })).toBeDisabled();

    await view.user.click(view.getByRole("button", { name: "common.close" }));
    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
  });

  it("en Lecture, la grille et la note restent figées", async () => {
    const view = await openOfM(ofM(MyAccessLevel.READ));

    const fields = within(view.card(1)).getAllByRole("textbox");
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(field).toBeDisabled();
  });

  it("en Lecture, une séance vide dit qu'elle l'est, sans inviter à la composer", async () => {
    const view = await openOfM({ ...ofM(MyAccessLevel.READ), blocks: [], exercises: [] });

    expect(view.getByText("library.session.readOnlyEmpty")).toBeInTheDocument();
    expect(view.queryByText("library.session.emptyTitle")).not.toBeInTheDocument();
  });

  it("en Écriture : modifiable, mais la suppression reste au propriétaire", async () => {
    api.getSession.mockResolvedValue(ofM(MyAccessLevel.WRITE));
    const view = await edit();

    expect(view.getByRole("textbox", { name: TITLE })).toBeEnabled();
    expect(view.getByRole("button", { name: ADD_EXERCISE })).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "library.session.deleteSession" })).toBeNull();
    expect(view.queryByText("library.session.readOnly")).not.toBeInTheDocument();
  });

  it("nomme les colonnes d'un exercice par les métriques de son propriétaire", async () => {
    const view = await openOfM(ofM(MyAccessLevel.READ));

    expect(within(view.card(2)).getAllByText(/Prises/).length).toBeGreaterThan(0);
  });
});
