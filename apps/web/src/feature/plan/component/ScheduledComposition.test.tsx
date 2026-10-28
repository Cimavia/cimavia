import {
  type BlockGrid,
  CompositionEditKind,
  CompositionOrigin,
  type ExerciseDto,
  MetricKey,
  MetricSource,
  MetricUnit,
  type PlanWeekDto,
  type ScheduledSessionBlockDto,
  type ScheduledSessionCopyDto,
  type ScheduledSessionDto,
  ScheduledSessionStatus,
  STRUCTURE_PRESETS,
  StructurePresetKey,
} from "@cmv/shared";
import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ScheduledComposition } from "./ScheduledComposition";

const { copiesMock } = vi.hoisted(() => ({ copiesMock: vi.fn() }));

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  getScheduledSessionCopies: copiesMock,
}));

const V1 = "2026-09-01T10:00:00.000Z";
const V2 = "2026-09-02T10:00:00.000Z";
const WEEKS = [
  { id: "pw-1", weekNumber: 1 },
  { id: "pw-2", weekNumber: 2 },
] as PlanWeekDto[];

const GRID: BlockGrid = {
  metrics: [
    {
      id: "reps",
      label: null,
      source: MetricSource.CATALOG,
      key: MetricKey.REPETITIONS,
      unit: MetricUnit.REPS,
    },
  ],
  rows: [{ id: "r0", values: { reps: 8 } }],
};
const SETTINGS = STRUCTURE_PRESETS[StructurePresetKey.SERIES];

type Planned = ScheduledSessionBlockDto["exercises"][number];
const received = (key: string): Planned => ({
  id: `sx-${key}`,
  key,
  note: null,
  grid: GRID,
  origin: { kind: CompositionOrigin.RECEIVED },
});

/** Un bloc reçu de la séance-type avec Tractions (`a`) puis Gainage (`b`). */
const blockOf = (exercises: Planned[]): ScheduledSessionBlockDto => ({
  id: "blk-1",
  name: "Séries",
  label: null,
  instructions: null,
  settings: SETTINGS,
  copiedSettings: SETTINGS,
  sourceStructureId: null,
  sourcePreset: StructurePresetKey.SERIES,
  baseline: {
    settings: SETTINGS,
    exercises: [
      { key: "a", exerciseId: "ex-a", note: null, grid: GRID },
      { key: "b", exerciseId: "ex-b", note: null, grid: GRID },
    ],
  },
  tracking: null,
  exercises,
});

const RECEIVED = [received("a"), received("b")];

const copyOf = (
  id: string,
  planWeekId: string,
  blocks: ScheduledSessionBlockDto[] = [blockOf(RECEIVED)],
): ScheduledSessionCopyDto => ({
  id,
  planWeekId,
  scheduledDate: planWeekId === "pw-1" ? "2026-09-09" : "2026-09-16",
  updatedAt: id === "ss-1" ? V1 : V2,
  status: ScheduledSessionStatus.PLANNED,
  blocks,
});

const row = (id: string, sourceExerciseId: string, title: string) => ({
  id,
  sourceExerciseId,
  title,
  tags: [],
  customMetrics: [],
});

const sessionOf = (blocks: ScheduledSessionBlockDto[]): ScheduledSessionDto =>
  ({
    id: "ss-1",
    sourceSessionId: "tpl-1",
    updatedAt: V1,
    blocks,
    exercises: [
      row("sx-a", "ex-a", "Tractions"),
      row("sx-b", "ex-b", "Gainage"),
      row("sx-n", "ex-rower", "Rameur"),
    ],
  }) as unknown as ScheduledSessionDto;

const libraryExercise = (id: string, title: string) =>
  ({ id, title, tags: [], suggestedMetrics: [], customMetrics: [] }) as unknown as ExerciseDto;
const LIBRARY = [
  libraryExercise("ex-a", "Tractions"),
  libraryExercise("ex-b", "Gainage"),
  libraryExercise("ex-rower", "Rameur"),
];

/** Le mode composition de `ss-1`, sur ce que `/copies` rendra (ou pas encore, ou en échec). */
function render(
  blocks: ScheduledSessionBlockDto[],
  over: Partial<Parameters<typeof ScheduledComposition>[0]> = {},
) {
  const onCompose = vi.fn().mockResolvedValue(undefined);
  const onReset = vi.fn().mockResolvedValue(undefined);
  const view = renderWithProviders(
    <ScheduledComposition
      session={sessionOf(blocks)}
      weeks={WEEKS}
      athleteName="Léa"
      isPublished={false}
      readOnly={false}
      exercises={LIBRARY}
      isBusy={false}
      onCompose={onCompose}
      onReset={onReset}
      {...over}
    />,
  );
  return { ...view, onCompose, onReset };
}

function mount(
  copies: ScheduledSessionCopyDto[],
  over: Partial<Parameters<typeof ScheduledComposition>[0]> = {},
) {
  copiesMock.mockResolvedValue(copies);
  return render(copies.find((copy) => copy.id === "ss-1")?.blocks ?? [], over);
}

const twoWeeks = () => [copyOf("ss-1", "pw-1"), copyOf("ss-2", "pw-2")];

/** Rameur à la place de Tractions, sur les deux semaines. */
const replaced = () => {
  const blocks = [
    blockOf([
      {
        ...received("n"),
        origin: { kind: CompositionOrigin.REPLACEMENT, replacesKey: "a" },
      },
      received("b"),
    ]),
  ];
  return [copyOf("ss-1", "pw-1", blocks), copyOf("ss-2", "pw-2", blocks)];
};

const VALIDATE = "plan.composition.dialog.validate";
const nthButton = (view: ReturnType<typeof mount>, name: string, index: number) =>
  view.getAllByRole("button", { name })[index] as HTMLElement;
const weekBoxes = (view: ReturnType<typeof mount>) =>
  view.getAllByRole("checkbox", { hidden: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ScheduledComposition", () => {
  it("attend les copies avant de rien montrer", () => {
    copiesMock.mockReturnValue(new Promise(() => {}));
    const view = render([blockOf(RECEIVED)]);

    expect(view.getByText("common.loading")).toBeInTheDocument();
  });

  it("dit l'échec de lecture des copies, et relit", async () => {
    copiesMock.mockRejectedValue(new Error("réseau"));
    const view = render([blockOf(RECEIVED)]);

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));
    await waitFor(() => expect(copiesMock).toHaveBeenCalledTimes(2));
  });

  it("lit la composition de la séance-type : ses exercices, sans rien à réinitialiser", async () => {
    const view = mount(twoWeeks(), { isPublished: true });

    expect(await view.findByText("Tractions")).toBeInTheDocument();
    expect(view.getByText("Gainage")).toBeInTheDocument();
    expect(view.getByText("plan.composition.fromSessionType")).toBeInTheDocument();
    expect(view.getByText("plan.composition.willSeeUpdate")).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "plan.composition.resetAll" })).toBeNull();
    expect(view.getByRole("link", { name: "plan.composition.viewSessionType" })).toHaveAttribute(
      "href",
      "/library/sessions/tpl-1",
    );
  });

  it("ajoute un exercice en fin de bloc, sur les semaines cochées", async () => {
    const view = mount(twoWeeks());

    await view.user.click(await view.findByRole("button", { name: /plan\.composition\.add/ }));
    expect(view.getByText("plan.composition.pick.addTitle")).toBeInTheDocument();
    await view.user.click(view.getByRole("button", { name: /Rameur/ }));

    // La semaine du panneau est cochée d'avance ; « Toutes » prend l'autre.
    const [all, here, other] = weekBoxes(view);
    expect(here).toBeChecked();
    expect(other).not.toBeChecked();
    await view.user.click(all as HTMLElement);
    await view.user.click(view.getByRole("button", { name: VALIDATE, hidden: true }));

    await waitFor(() =>
      expect(view.onCompose).toHaveBeenCalledWith({
        edit: {
          kind: CompositionEditKind.ADD,
          blockIndex: 0,
          key: expect.any(String),
          exerciseId: "ex-rower",
        },
        apply: [
          { id: "ss-1", expectedUpdatedAt: V1 },
          { id: "ss-2", expectedUpdatedAt: V2 },
        ],
        revert: [],
      }),
    );
    await waitFor(() =>
      expect(view.queryByText("plan.composition.dialog.title")).not.toBeInTheDocument(),
    );
  });

  it("referme la sélection sans rien changer", async () => {
    const view = mount(twoWeeks());

    await view.user.click(await view.findByRole("button", { name: /plan\.composition\.add/ }));
    await view.user.click(view.getByRole("button", { name: "plan.composition.pick.cancel" }));

    expect(view.queryByText("plan.composition.pick.addTitle")).toBeNull();
    expect(view.onCompose).not.toHaveBeenCalled();
  });

  it("remplace un exercice de la séance-type à sa place", async () => {
    const view = mount(twoWeeks());

    await view.findByText("Tractions");
    await view.user.click(nthButton(view, "plan.composition.replace", 0));
    expect(view.getByText("plan.composition.pick.replaceTitle")).toBeInTheDocument();
    await view.user.click(view.getByRole("button", { name: /Rameur/ }));
    await view.user.click(view.getByRole("button", { name: VALIDATE, hidden: true }));

    await waitFor(() =>
      expect(view.onCompose).toHaveBeenCalledWith({
        edit: {
          kind: CompositionEditKind.REPLACE,
          blockIndex: 0,
          replacesKey: "a",
          key: expect.any(String),
          exerciseId: "ex-rower",
        },
        apply: [{ id: "ss-1", expectedUpdatedAt: V1 }],
        revert: [],
      }),
    );
  });

  it("retire un exercice de la séance-type, et l'annuler n'envoie rien", async () => {
    const view = mount(twoWeeks());

    await view.findByText("Gainage");
    await view.user.click(nthButton(view, "plan.composition.remove", 1));
    await view.user.click(
      view.getByRole("button", { name: "plan.composition.dialog.cancel", hidden: true }),
    );
    expect(view.onCompose).not.toHaveBeenCalled();

    await view.user.click(nthButton(view, "plan.composition.remove", 1));
    await view.user.click(view.getByRole("button", { name: VALIDATE, hidden: true }));

    await waitFor(() =>
      expect(view.onCompose).toHaveBeenCalledWith({
        edit: { kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "b" },
        apply: [{ id: "ss-1", expectedUpdatedAt: V1 }],
        revert: [],
      }),
    );
  });

  it("coche une autre semaine à la main, et Échap referme sans rien envoyer", async () => {
    const view = mount(twoWeeks());

    await view.findByText("Gainage");
    await view.user.click(nthButton(view, "plan.composition.remove", 1));
    // jsdom ne traduit pas Échap en `cancel` : on envoie l'événement que le navigateur produit.
    act(() => {
      view
        .getByRole("dialog", { hidden: true })
        .dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(view.queryByText("plan.composition.dialog.title")).not.toBeInTheDocument();

    await view.user.click(nthButton(view, "plan.composition.remove", 1));
    const [, here, other] = weekBoxes(view);
    await view.user.click(other as HTMLElement);
    await view.user.click(here as HTMLElement);
    await view.user.click(view.getByRole("button", { name: VALIDATE, hidden: true }));

    await waitFor(() =>
      expect(view.onCompose).toHaveBeenCalledWith({
        edit: { kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "b" },
        apply: [{ id: "ss-2", expectedUpdatedAt: V2 }],
        revert: [],
      }),
    );
    expect(view.onCompose).toHaveBeenCalledOnce();
  });

  it("grise la semaine où le changement ne s'appliquerait pas, avec sa raison", async () => {
    const view = mount([copyOf("ss-1", "pw-1"), copyOf("ss-2", "pw-2", [])]);

    await view.findByText("Gainage");
    await view.user.click(nthButton(view, "plan.composition.remove", 0));

    expect(weekBoxes(view)[2]).toBeDisabled();
    expect(view.getByText("plan.composition.dialog.refusal.NO_BLOCK")).toBeInTheDocument();
  });

  describe("une composition changée", () => {
    it("compte ses changements, dit ce que la séance-type mettait là, et se réinitialise", async () => {
      const view = mount(replaced());

      expect(await view.findByText("plan.composition.changes")).toBeInTheDocument();
      expect(view.getByText("Rameur")).toBeInTheDocument();
      expect(view.getByText("plan.composition.sessionType")).toBeInTheDocument();

      await view.user.click(view.getByRole("button", { name: "plan.composition.resetAll" }));
      await view.user.click(view.getByRole("button", { name: "plan.composition.resetConfirm" }));

      expect(view.onReset).toHaveBeenCalledWith(V1);
    });

    it("revient à la séance-type sur la semaine du panneau seule", async () => {
      const view = mount(replaced());

      await view.user.click(
        await view.findByRole("button", { name: "plan.composition.backToSessionType" }),
      );

      expect(view.onCompose).toHaveBeenCalledWith({
        edit: {
          kind: CompositionEditKind.REPLACE,
          blockIndex: 0,
          replacesKey: "a",
          key: "n",
          exerciseId: "ex-rower",
        },
        apply: [],
        revert: [{ id: "ss-1", expectedUpdatedAt: V1 }],
      });
    });

    it("rouvre le changement par son étiquette, et l'annule partout une fois tout décoché", async () => {
      const view = mount(replaced());

      await view.user.click(
        await view.findByRole("button", { name: /plan\.composition\.change\.REPLACE/ }),
      );
      const [all, here, other] = weekBoxes(view);
      expect(here).toBeChecked();
      expect(other).toBeChecked();
      await view.user.click(all as HTMLElement);
      await view.user.click(
        view.getByRole("button", { name: "plan.composition.dialog.cancelChange", hidden: true }),
      );

      await waitFor(() =>
        expect(view.onCompose).toHaveBeenCalledWith(
          expect.objectContaining({
            apply: [],
            revert: [
              { id: "ss-1", expectedUpdatedAt: V1 },
              { id: "ss-2", expectedUpdatedAt: V2 },
            ],
          }),
        ),
      );
    });

    it("garde la semaine débriefée telle quelle, et annule le changement là où il peut l'être", async () => {
      const [here, done] = replaced() as [ScheduledSessionCopyDto, ScheduledSessionCopyDto];
      const view = mount([here, { ...done, status: ScheduledSessionStatus.DONE }]);

      await view.user.click(
        await view.findByRole("button", { name: /plan\.composition\.change\.REPLACE/ }),
      );
      const [, mine, debriefed] = weekBoxes(view);
      expect(debriefed).toBeDisabled();
      expect(debriefed).toBeChecked();
      expect(view.getByText("plan.composition.dialog.refusal.DEBRIEFED")).toBeInTheDocument();
      await view.user.click(mine as HTMLElement);
      await view.user.click(
        view.getByRole("button", { name: "plan.composition.dialog.cancelChange", hidden: true }),
      );

      await waitFor(() =>
        expect(view.onCompose).toHaveBeenCalledWith(
          expect.objectContaining({ apply: [], revert: [{ id: "ss-1", expectedUpdatedAt: V1 }] }),
        ),
      );
    });

    it("montre barré l'exercice retiré, que son étiquette rend", async () => {
      const blocks = [blockOf([received("a")])];
      const view = mount([copyOf("ss-1", "pw-1", blocks), copyOf("ss-2", "pw-2")]);

      expect(await view.findByText("Gainage")).toHaveClass("line-through");
      expect(
        view.getByRole("button", { name: /plan\.composition\.change\.REMOVE/ }),
      ).toBeInTheDocument();
    });
  });

  it("nomme un bloc à libellé sans codes, et ne remplace ni ne retire un ajout", async () => {
    const note = (key: string, exerciseId: string) => ({ key, exerciseId, note: null, grid: GRID });
    const labelled: ScheduledSessionBlockDto = {
      ...blockOf([
        received("a"),
        received("q"),
        { ...received("n"), origin: { kind: CompositionOrigin.ADDED } },
      ]),
      label: "Échauffement",
      baseline: {
        settings: SETTINGS,
        exercises: [note("a", "ex-a"), note("q", "ex-q"), note("z", "ex-gone")],
      },
    };
    const view = mount([copyOf("ss-1", "pw-1", [labelled]), copyOf("ss-2", "pw-2")]);

    expect(await view.findByText("Échauffement")).toBeInTheDocument();
    // Un exercice que la séance ne nomme plus, et un retrait dont la source a disparu.
    expect(view.getByText("—")).toBeInTheDocument();
    expect(view.getByText("plan.composition.noSource")).toHaveClass("line-through");
    // Tractions et l'exercice sans nom se remplacent ; Rameur, ajouté, se défait par son étiquette.
    expect(view.getAllByRole("button", { name: "plan.composition.replace" })).toHaveLength(2);
    expect(view.queryByText("plan.composition.arrivesAt")).toBeNull();
  });

  it("dit l'ajout dans un bloc à libellé, sans semaine pour une copie hors du cycle", async () => {
    const labelled = { ...blockOf(RECEIVED), label: "Échauffement" };
    const view = mount([copyOf("ss-1", "pw-1", [labelled]), copyOf("ss-2", "pw-9", [labelled])]);

    await view.user.click(await view.findByRole("button", { name: /plan\.composition\.add/ }));
    await view.user.click(view.getByRole("button", { name: /Rameur/ }));

    expect(view.getByText("plan.composition.dialog.what.ADD")).toBeInTheDocument();
    // La copie sans semaine se dit par son jour seul.
    expect(view.getAllByText(/plan\.composition\.week/)).toHaveLength(1);
  });

  it("ne dit rien en bas tant qu'aucune semaine n'est cochée, et attend l'envoi pour se fermer", async () => {
    const view = mount(twoWeeks(), { isBusy: false });

    await view.findByText("Gainage");
    await view.user.click(nthButton(view, "plan.composition.remove", 1));
    const [, here] = weekBoxes(view);
    await view.user.click(here as HTMLElement);

    expect(view.queryByText(/plan\.composition\.change\.REMOVE/)).toBeNull();
    expect(view.getByRole("button", { name: VALIDATE, hidden: true })).toBeDisabled();
  });

  it("garde la fenêtre ouverte sur Échap pendant un envoi", async () => {
    const view = mount(replaced());
    await view.user.click(
      await view.findByRole("button", { name: /plan\.composition\.change\.REPLACE/ }),
    );
    view.rerender(
      <ScheduledComposition
        session={sessionOf(replaced()[0]?.blocks ?? [])}
        weeks={WEEKS}
        athleteName="Léa"
        isPublished={false}
        readOnly={false}
        exercises={LIBRARY}
        isBusy
        onCompose={view.onCompose}
        onReset={view.onReset}
      />,
    );

    act(() => {
      view
        .getByRole("dialog", { hidden: true })
        .dispatchEvent(new Event("cancel", { cancelable: true }));
    });

    expect(view.getByText("plan.composition.dialog.title")).toBeInTheDocument();
  });

  it("se lit seulement, en Lecture", async () => {
    const view = mount(replaced(), { readOnly: true });

    await view.findByText("Rameur");
    expect(view.queryByRole("button", { name: /plan\.composition\.add/ })).toBeNull();
    expect(view.queryByRole("button", { name: "plan.composition.replace" })).toBeNull();
    expect(view.queryByRole("button", { name: "plan.composition.resetAll" })).toBeNull();
    expect(view.getByRole("button", { name: /plan\.composition\.change\.REPLACE/ })).toBeDisabled();
  });
});
