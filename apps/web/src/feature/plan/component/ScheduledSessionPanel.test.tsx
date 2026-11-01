import {
  CompositionOrigin,
  type PlanWeekDto,
  ProblemType,
  type ScheduledSessionDto,
  SESSION_NOTES_MAX_LENGTH,
  SESSION_TITLE_MAX_LENGTH,
  STRUCTURE_PRESETS,
  StructurePresetKey,
} from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api";
import { renderWithProviders } from "../../../../test/render";
import { ScheduledSessionPanel } from "./ScheduledSessionPanel";

const {
  createMock,
  updateMock,
  deleteMock,
  copiesMock,
  composeMock,
  resetMock,
  listSessionsMock,
  listExercisesMock,
  listCustomMetricsMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  copiesMock: vi.fn(),
  composeMock: vi.fn(),
  resetMock: vi.fn(),
  listSessionsMock: vi.fn(),
  listExercisesMock: vi.fn(),
  listCustomMetricsMock: vi.fn(),
}));

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  createScheduledSession: createMock,
  updateScheduledSession: updateMock,
  deleteScheduledSession: deleteMock,
  getScheduledSessionCopies: copiesMock,
  composeScheduledSession: composeMock,
  resetScheduledComposition: resetMock,
}));

// La bibliothèque n'est pas le sujet ici : ses listes sont des ENTRÉES du panneau.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  listSessions: listSessionsMock,
  listExercises: listExercisesMock,
  listCustomMetrics: listCustomMetricsMock,
}));

const SUBMIT = "plan.session.submit";
// TITLE porte l'astérisque d'obligation et se vise donc par son RÔLE : `getByLabelText` lit le
// `textContent` du `<label>`, astérisque compris, et ne le trouverait plus (« Tranché en #97 »).
const TITLE = "plan.session.titleLabel";
const NOTES = "plan.session.notesLabel";
const TEMPLATE = "plan.session.template";

// Un cycle de deux semaines : le sélecteur « Jour » les couvre toutes deux (#689).
const PLAN_START = "2026-09-07";
const WEEKS = [
  { id: "week-1", weekNumber: 1, startDate: PLAN_START },
  { id: "week-2", weekNumber: 2, startDate: "2026-09-14" },
] as PlanWeekDto[];
const DATE = "2026-09-09";
const NEXT_WEEK_THURSDAY = "2026-09-17";
// La version de la séance à l'ouverture : celle qu'enregistrer et supprimer citent (#604).
const VERSION = "2026-09-01T10:00:00.000Z";

const settings = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const grid = { metrics: [], rows: [] };
const blocks = [
  {
    id: "blk-1",
    name: "Séries",
    label: null,
    instructions: null,
    settings,
    copiedSettings: settings,
    sourceStructureId: null,
    sourcePreset: StructurePresetKey.SERIES,
    baseline: { settings, exercises: [{ key: "a", exerciseId: "ex-1", note: null, grid }] },
    tracking: null,
    exercises: [
      { id: "sx-1", key: "a", note: null, grid, origin: { kind: CompositionOrigin.RECEIVED } },
    ],
  },
];

/** La séance planifiée dans la fenêtre de composition, à telle version. */
const copy = (updatedAt: string) => ({
  id: "ss-1",
  planWeekId: "week-1",
  scheduledDate: DATE,
  updatedAt,
  status: "PLANNED",
  blocks,
});

const session = (over: Partial<ScheduledSessionDto> = {}): ScheduledSessionDto =>
  ({
    id: "ss-1",
    title: "Séance haute",
    notes: "Échauffement long",
    scheduledDate: DATE,
    updatedAt: VERSION,
    blocks,
    exercises: [{ id: "sx-1", sourceExerciseId: "ex-1", title: "Traction", tags: ["dos"] }],
    ...over,
  }) as unknown as ScheduledSessionDto;

function setup(over: Partial<Parameters<typeof ScheduledSessionPanel>[0]> = {}) {
  const onClose = vi.fn();
  const onUnsavedChange = vi.fn();
  const onReload = vi.fn();
  const view = renderWithProviders(
    <ScheduledSessionPanel
      planId="plan-1"
      isPublished={false}
      readOnly={false}
      planStartDate={PLAN_START}
      weeks={WEEKS}
      date={DATE}
      session={null}
      athleteName="Léa Bonnet"
      onClose={onClose}
      onUnsavedChange={onUnsavedChange}
      onReload={onReload}
      isReloading={false}
      {...over}
    />,
  );
  return { ...view, onClose, onUnsavedChange, onReload };
}

beforeEach(() => {
  vi.clearAllMocks();
  listSessionsMock.mockResolvedValue([{ id: "tpl-1", title: "Modèle force" }]);
  listExercisesMock.mockResolvedValue([]);
  listCustomMetricsMock.mockResolvedValue([]);
  copiesMock.mockResolvedValue([copy(VERSION)]);
});

describe("ScheduledSessionPanel", () => {
  describe("à la création", () => {
    // Le panneau ne crée plus de séance vide (#720) : elle n'aurait aucun bloc à composer.
    it("exige un modèle, sans offrir de titre", () => {
      const { getByRole, queryByRole } = setup();

      expect(getByRole("button", { name: SUBMIT })).toBeDisabled();
      expect(queryByRole("textbox", { name: TITLE })).not.toBeInTheDocument();
    });

    it("n'envoie aucun titre quand la séance vient d'un modèle", async () => {
      createMock.mockResolvedValue(session());
      const { user, getByRole, getByLabelText, findByRole } = setup();

      await findByRole("option", { name: "Modèle force" });
      await user.selectOptions(getByLabelText(TEMPLATE), "tpl-1");
      await user.click(getByRole("button", { name: SUBMIT }));

      // L'API copie titre, consignes, exercices et documents du modèle : lui envoyer un titre
      // écraserait celui qu'elle vient de recopier.
      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith("week-1", {
          sourceSessionId: "tpl-1",
          scheduledDate: DATE,
        }),
      );
    });

    it("borne le titre, à l'édition, à ce que l'API accepte (#319)", () => {
      const { getByRole } = setup({ session: session() });

      expect(getByRole("textbox", { name: TITLE })).toHaveAttribute(
        "maxLength",
        String(SESSION_TITLE_MAX_LENGTH),
      );
    });
  });

  describe("le sélecteur « Jour » (#689)", () => {
    it("propose tous les jours du cycle, regroupés par semaine", () => {
      const { getByLabelText } = setup();

      const groups = Array.from(
        (getByLabelText("plan.session.day") as HTMLSelectElement).querySelectorAll("optgroup"),
      );
      expect(groups.map((group) => group.label)).toEqual(["plan.week.number", "plan.week.number"]);
      expect(groups.map((group) => group.querySelectorAll("option").length)).toEqual([7, 7]);
    });

    // Le jour choisi désigne la semaine : créer depuis la S1 un jeudi de S2 part dans la S2.
    it("crée la séance dans la semaine du jour choisi", async () => {
      createMock.mockResolvedValue(session());
      const { user, getByRole, getByLabelText, findByRole } = setup();

      await user.selectOptions(getByLabelText("plan.session.day"), NEXT_WEEK_THURSDAY);
      await findByRole("option", { name: "Modèle force" });
      await user.selectOptions(getByLabelText(TEMPLATE), "tpl-1");
      await user.click(getByRole("button", { name: SUBMIT }));

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith(
          "week-2",
          expect.objectContaining({ scheduledDate: NEXT_WEEK_THURSDAY }),
        ),
      );
    });

    // Un autre Coach a retiré la S2 depuis l'ouverture : la création ne saurait où partir.
    it("refuse de créer sur un jour sorti du cycle, et dit pourquoi", async () => {
      const { user, getByRole, getByLabelText, findByRole, findByText, onClose } = setup({
        weeks: WEEKS.slice(0, 1),
        date: NEXT_WEEK_THURSDAY,
      });

      await findByRole("option", { name: "Modèle force" });
      await user.selectOptions(getByLabelText(TEMPLATE), "tpl-1");
      await user.click(getByRole("button", { name: SUBMIT }));

      expect(await findByText("plan.session.dayOutsideCycle")).toBeInTheDocument();
      expect(createMock).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("déplace une séance vers une autre semaine du cycle", async () => {
      updateMock.mockResolvedValue(session());
      const { user, getByLabelText, getByRole } = setup({ session: session() });

      await user.selectOptions(getByLabelText("plan.session.day"), NEXT_WEEK_THURSDAY);
      await user.click(getByRole("button", { name: SUBMIT }));

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(
          "ss-1",
          expect.objectContaining({ scheduledDate: NEXT_WEEK_THURSDAY }),
        ),
      );
    });
  });

  describe("à l'édition", () => {
    it("borne la consigne à ce que l'API accepte (#319)", () => {
      const { getByLabelText } = setup({ session: session() });

      expect(getByLabelText(NOTES)).toHaveAttribute("maxLength", String(SESSION_NOTES_MAX_LENGTH));
    });

    it("envoie null plutôt qu'une consigne vide", async () => {
      updateMock.mockResolvedValue(session());
      const { user, getByLabelText, getByRole } = setup({ session: session() });

      await user.clear(getByLabelText(NOTES));
      await user.type(getByLabelText(NOTES), "   ");
      await user.click(getByRole("button", { name: SUBMIT }));

      // Champ vidé = pas de consigne, pas une consigne qui vaut « » (règle dure n°5).
      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith("ss-1", expect.objectContaining({ notes: null })),
      );
    });

    it("modifie la séance existante plutôt que d'en créer une", async () => {
      updateMock.mockResolvedValue(session());
      const { user, getByRole } = setup({ session: session() });

      await user.click(getByRole("button", { name: SUBMIT }));

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(
          "ss-1",
          expect.objectContaining({ expectedUpdatedAt: VERSION }),
        ),
      );
      expect(createMock).not.toHaveBeenCalled();
    });

    it("déplace la séance sur le jour choisi", async () => {
      updateMock.mockResolvedValue(session());
      const { user, getByLabelText, getByRole } = setup({ session: session() });

      await user.selectOptions(getByLabelText("plan.session.day"), "2026-09-11");
      await user.click(getByRole("button", { name: SUBMIT }));

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(
          "ss-1",
          expect.objectContaining({ scheduledDate: "2026-09-11" }),
        ),
      );
    });

    it("dit que l'enregistrement part, et ne se relance pas pendant ce temps", async () => {
      updateMock.mockReturnValue(new Promise(() => {}));
      const { user, getByRole, findByRole } = setup({ session: session() });

      await user.click(getByRole("button", { name: SUBMIT }));

      expect(await findByRole("button", { name: "plan.session.submitting" })).toBeDisabled();
    });

    it("ne propose pas de modèle sur une séance déjà posée", () => {
      const { queryByLabelText } = setup({ session: session() });

      // Le modèle sert à AMORCER une séance ; le rejouer sur une séance existante écraserait ce
      // que le coach y a composé.
      expect(queryByLabelText(TEMPLATE)).not.toBeInTheDocument();
    });

    it("supprime la séance après confirmation", async () => {
      deleteMock.mockResolvedValue(undefined);
      const { user, getByRole } = setup({ session: session() });

      await user.click(getByRole("button", { name: "plan.session.delete" }));
      await user.click(getByRole("button", { name: "common.confirmDelete" }));

      await waitFor(() =>
        expect(deleteMock).toHaveBeenCalledWith("ss-1", { expectedUpdatedAt: VERSION }),
      );
    });

    // #313 : la suppression emporterait le débrief de l'athlète, l'API la refuse. Le bouton reste
    // à sa place, grisé, et dit pourquoi — un bouton qui disparaît ne s'explique pas.
    it("grise la suppression d'une séance débriefée, et dit pourquoi", () => {
      const { getByRole, getByTitle } = setup({ session: session({ status: "DONE" }) });

      expect(getByRole("button", { name: "plan.session.delete" })).toBeDisabled();
      expect(getByTitle("plan.session.deleteDisabledDebriefed")).toBeInTheDocument();
    });

    it("annonce la notification de l'athlète avant de retirer une séance d'un cycle diffusé", async () => {
      const { user, getByRole, getByText } = setup({
        session: session({ status: "PLANNED" }),
        isPublished: true,
      });

      await user.click(getByRole("button", { name: "plan.session.delete" }));

      expect(getByText("plan.session.deleteHintPublished")).toBeInTheDocument();
    });

    it("n'annonce rien sur un brouillon : l'athlète ne voit pas encore le cycle", async () => {
      const { user, getByRole, queryByText, queryByTitle } = setup({
        session: session({ status: "PLANNED" }),
      });

      await user.click(getByRole("button", { name: "plan.session.delete" }));

      expect(queryByText("plan.session.deleteHintPublished")).not.toBeInTheDocument();
      expect(queryByTitle("plan.session.deleteDisabledDebriefed")).not.toBeInTheDocument();
    });
  });
});

/**
 * Deux Coachs ajustent la même séance (#604) : l'enregistrement fondé sur une version périmée est
 * refusé, et le panneau le dit à côté de la saisie, qu'il garde — un toast disparaîtrait en
 * emportant la seule explication.
 */
describe("ScheduledSessionPanel — conflit d'édition (#604)", () => {
  const STALE = "library.session.stale";
  const stale = () => new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE);

  beforeEach(() => {
    vi.clearAllMocks();
    listSessionsMock.mockResolvedValue([]);
    listExercisesMock.mockResolvedValue([]);
    listCustomMetricsMock.mockResolvedValue([]);
  });

  it("garde la saisie et le dit par le bandeau, sans toast ni fermeture", async () => {
    updateMock.mockRejectedValue(stale());
    const { user, getByRole, findByText, queryByText, onClose } = setup({ session: session() });
    const title = getByRole("textbox", { name: TITLE });
    await user.clear(title);
    await user.type(title, "Saisie gardée");

    await user.click(getByRole("button", { name: SUBMIT }));

    expect(await findByText(STALE)).toBeInTheDocument();
    expect(getByRole("textbox", { name: TITLE })).toHaveValue("Saisie gardée");
    expect(queryByText("Conflit")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  async function remove(view: ReturnType<typeof setup>) {
    await view.user.click(view.getByRole("button", { name: "plan.session.delete" }));
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));
  }

  // Une suppression n'a pas de saisie à garder : le bandeau invite à voir ce qui a changé.
  it("le dit aussi quand la suppression trouve la séance changée", async () => {
    deleteMock.mockRejectedValue(stale());
    const view = setup({ session: session() });

    await remove(view);

    expect(await view.findByText("plan.session.staleDelete")).toBeInTheDocument();
    expect(view.onClose).not.toHaveBeenCalled();
  });

  it("ne garde que le refus du dernier geste", async () => {
    updateMock.mockRejectedValue(stale());
    deleteMock.mockRejectedValue(new ApiError(409, "Séance débriefée", null));
    const view = setup({ session: session() });
    await view.user.click(view.getByRole("button", { name: SUBMIT }));
    await view.findByText(STALE);

    await remove(view);

    expect(await view.findByText("Séance débriefée")).toBeInTheDocument();
    expect(view.queryByText(STALE)).not.toBeInTheDocument();
  });

  it("« Recharger » demande la dernière version à l'écran", async () => {
    updateMock.mockRejectedValue(stale());
    const { user, getByRole, findByRole, onReload } = setup({ session: session() });
    await user.click(getByRole("button", { name: SUBMIT }));

    await user.click(await findByRole("button", { name: "common.staleReload" }));

    expect(onReload).toHaveBeenCalledOnce();
  });

  it("ne montre pas de bandeau pour un autre refus", async () => {
    updateMock.mockRejectedValue(new ApiError(400, "Requête invalide", null));
    const { user, getByRole, findByText, queryByText } = setup({ session: session() });

    await user.click(getByRole("button", { name: SUBMIT }));

    expect(await findByText("Requête invalide")).toBeInTheDocument();
    expect(queryByText(STALE)).not.toBeInTheDocument();
  });

  // La séance en cache peut être relue pendant la saisie (retour d'onglet) : la saisie, elle, ne
  // l'a pas vue, et citer la version relue écraserait ce que l'autre Coach a enregistré.
  it("cite la version de l'ouverture, même relue entre-temps", async () => {
    updateMock.mockResolvedValue(session());
    const { user, getByRole, rerender } = setup({ session: session() });
    rerender(
      <ScheduledSessionPanel
        planId="plan-1"
        isPublished={false}
        readOnly={false}
        planStartDate={PLAN_START}
        weeks={WEEKS}
        date={DATE}
        session={session({ updatedAt: "2026-09-02T10:00:00.000Z" })}
        athleteName="Léa Bonnet"
        onClose={vi.fn()}
        onUnsavedChange={vi.fn()}
        onReload={vi.fn()}
        isReloading={false}
      />,
    );

    await user.click(getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        "ss-1",
        expect.objectContaining({ expectedUpdatedAt: VERSION }),
      ),
    );
  });
});

/** #518, **G-1** : refermer une saisie non enregistrée demande. */
describe("ScheduledSessionPanel — fermer une saisie non enregistrée", () => {
  const CANCEL = "common.cancel";
  const LEAVE_TITLE = "common.leave.title";

  it("se ferme sans rien demander tant que rien n'a changé", async () => {
    const { user, getByRole, queryByText, onClose, onUnsavedChange } = setup({
      session: session(),
    });

    await user.click(getByRole("button", { name: CANCEL }));

    expect(queryByText(LEAVE_TITLE)).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onUnsavedChange).not.toHaveBeenCalledWith(expect.any(Function));
  });

  it("ne retient rien pour une espace ajoutée au titre", async () => {
    const { user, getByRole, onClose } = setup({ session: session() });

    await user.type(getByRole("textbox", { name: TITLE }), " ");
    await user.click(getByRole("button", { name: CANCEL }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("demande avant de perdre la saisie, et « Annuler » la garde", async () => {
    const { user, getByLabelText, getByRole, queryByText, onClose, onUnsavedChange } = setup({
      session: session(),
    });

    await user.type(getByLabelText(NOTES), " et les poignets");
    expect(onUnsavedChange).toHaveBeenLastCalledWith(expect.any(Function));
    await user.click(getByRole("button", { name: CANCEL }));

    expect(queryByText(LEAVE_TITLE)).toBeInTheDocument();
    await user.click(getByRole("button", { name: "common.leave.cancel", hidden: true }));

    expect(onClose).not.toHaveBeenCalled();
    expect(queryByText(LEAVE_TITLE)).not.toBeInTheDocument();
    expect(getByLabelText(NOTES)).toHaveValue("Échauffement long et les poignets");
  });

  it("referme sur « Ne pas enregistrer », sans rien envoyer", async () => {
    const { user, getByLabelText, getByRole, onClose } = setup({ session: session() });

    await user.type(getByLabelText(NOTES), " et les poignets");
    await user.click(getByRole("button", { name: CANCEL }));
    await user.click(getByRole("button", { name: "common.leave.discard", hidden: true }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(updateMock).not.toHaveBeenCalled();
  });

  // #682 : garder son travail ET partir, sans passer par « Annuler », « Enregistrer », refermer.
  it("enregistre, puis referme, sur « Enregistrer »", async () => {
    updateMock.mockResolvedValue(session());
    const { user, getByLabelText, getByRole, onClose } = setup({ session: session() });

    await user.type(getByLabelText(NOTES), " et les poignets");
    await user.click(getByRole("button", { name: CANCEL }));
    await user.click(getByRole("button", { name: "common.leave.save", hidden: true }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(updateMock).toHaveBeenCalledWith(
      "ss-1",
      expect.objectContaining({ notes: "Échauffement long et les poignets" }),
    );
  });

  // Le conflit se dit par le bandeau, à côté de la saisie : le panneau reste, la question part.
  it("reste ouvert, la question fermée, quand l'enregistrement est refusé", async () => {
    updateMock.mockRejectedValue(new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE));
    const { user, getByLabelText, getByRole, queryByText, findByText, onClose } = setup({
      session: session(),
    });

    await user.type(getByLabelText(NOTES), " et les poignets");
    await user.click(getByRole("button", { name: CANCEL }));
    await user.click(getByRole("button", { name: "common.leave.save", hidden: true }));

    expect(await findByText("library.session.stale")).toBeInTheDocument();
    await waitFor(() => expect(queryByText(LEAVE_TITLE)).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  // Un jour choisi sans modèle : la saisie compte, mais la séance ne peut pas naître.
  it("dit pourquoi une séance sans modèle ne s'enregistre pas", async () => {
    const { user, getByLabelText, getByRole, findByText, onClose, onUnsavedChange } = setup();

    await user.selectOptions(getByLabelText("plan.session.day"), "2026-09-10");
    await user.click(getByRole("button", { name: CANCEL }));
    await user.click(getByRole("button", { name: "common.leave.save", hidden: true }));

    expect(await findByText("plan.session.templateRequired")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUnsavedChange).toHaveBeenLastCalledWith(expect.any(Function));
  });

  it("garde aussi une séance en cours de création", async () => {
    const { user, getByRole, getByLabelText, findByRole, queryByText, onClose } = setup();

    await findByRole("option", { name: "Modèle force" });
    await user.selectOptions(getByLabelText(TEMPLATE), "tpl-1");
    await user.click(getByRole("button", { name: CANCEL }));

    expect(queryByText(LEAVE_TITLE)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("referme sans demander après un enregistrement réussi", async () => {
    updateMock.mockResolvedValue(session());
    const { user, getByLabelText, getByRole, queryByText, onClose } = setup({
      session: session(),
    });

    await user.type(getByLabelText(NOTES), " et les poignets");
    await user.click(getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(queryByText(LEAVE_TITLE)).not.toBeInTheDocument();
  });
});

describe("ScheduledSessionPanel — la composition par blocs (#720)", () => {
  const LATER = "2026-09-02T10:00:00.000Z";
  const byBlocks = () => session();

  beforeEach(() => {
    listExercisesMock.mockResolvedValue([
      { id: "ex-2", title: "Rameur", tags: [], suggestedMetrics: [], customMetrics: [] },
    ]);
  });

  async function addRower(view: ReturnType<typeof setup>) {
    await view.user.click(await view.findByRole("button", { name: /plan\.composition\.add/ }));
    await view.user.click(await view.findByRole("button", { name: /Rameur/ }));
    await view.user.click(
      view.getByRole("button", { name: "plan.composition.dialog.validate", hidden: true }),
    );
  }

  it("se compose par blocs, la bibliothèque ouverte dans le bloc et pas à côté", async () => {
    const view = setup({ session: byBlocks() });

    expect(await view.findByText("plan.composition.fromSessionType")).toBeInTheDocument();
    expect(view.queryByText("plan.session.pickerTitle")).toBeNull();
  });

  it("enregistre titre, consignes et jour sans la composition, sous la version d'après un geste", async () => {
    composeMock.mockResolvedValue([copy(LATER)]);
    updateMock.mockResolvedValue(byBlocks());
    const view = setup({ session: byBlocks() });

    await addRower(view);
    await waitFor(() => expect(composeMock).toHaveBeenCalledOnce());
    await view.user.type(view.getByLabelText(NOTES), " et les poignets");
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("ss-1", {
        title: "Séance haute",
        notes: "Échauffement long et les poignets",
        scheduledDate: DATE,
        expectedUpdatedAt: LATER,
      }),
    );
  });

  it("n'absorbe pas l'écriture d'un autre : un geste parti d'une version plus récente laisse la saisie où elle était", async () => {
    const OTHER = "2026-09-01T12:00:00.000Z";
    copiesMock.mockResolvedValue([copy(OTHER)]);
    composeMock.mockResolvedValue([copy(LATER)]);
    updateMock.mockResolvedValue(byBlocks());
    const view = setup({ session: byBlocks() });

    await addRower(view);
    await waitFor(() =>
      expect(composeMock).toHaveBeenCalledWith(
        "ss-1",
        expect.objectContaining({ apply: [{ id: "ss-1", expectedUpdatedAt: OTHER }] }),
      ),
    );
    await view.user.type(view.getByLabelText(NOTES), " !");
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        "ss-1",
        expect.objectContaining({ expectedUpdatedAt: VERSION }),
      ),
    );
  });

  it("réinitialise la composition, puis enregistre sous la version qu'elle rend", async () => {
    const without = [{ ...blocks[0], exercises: [] }];
    copiesMock.mockResolvedValue([{ ...copy(VERSION), blocks: without }]);
    resetMock.mockResolvedValue([copy(LATER)]);
    updateMock.mockResolvedValue(byBlocks());
    const view = setup({ session: byBlocks() });

    await view.user.click(await view.findByRole("button", { name: "plan.composition.resetAll" }));
    await view.user.click(view.getByRole("button", { name: "plan.composition.resetConfirm" }));
    await waitFor(() =>
      expect(resetMock).toHaveBeenCalledWith("ss-1", { expectedUpdatedAt: VERSION }),
    );
    await view.user.type(view.getByLabelText(NOTES), " !");
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        "ss-1",
        expect.objectContaining({ expectedUpdatedAt: LATER }),
      ),
    );
  });

  it("garde sa version quand le geste ne touche qu'une autre semaine", async () => {
    const other = { ...copy(LATER), id: "ss-2", planWeekId: "week-2" };
    copiesMock.mockResolvedValue([copy(VERSION), other]);
    composeMock.mockResolvedValue([copy(VERSION), { ...other, updatedAt: VERSION }]);
    updateMock.mockResolvedValue(byBlocks());
    const view = setup({ session: byBlocks() });

    await view.user.click(await view.findByRole("button", { name: /plan\.composition\.add/ }));
    await view.user.click(await view.findByRole("button", { name: /Rameur/ }));
    const [, here, next] = view.getAllByRole("checkbox", { hidden: true });
    await view.user.click(here as HTMLElement);
    await view.user.click(next as HTMLElement);
    await view.user.click(
      view.getByRole("button", { name: "plan.composition.dialog.validate", hidden: true }),
    );
    await waitFor(() => expect(composeMock).toHaveBeenCalledOnce());
    await view.user.type(view.getByLabelText(NOTES), " !");
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        "ss-1",
        expect.objectContaining({ expectedUpdatedAt: VERSION }),
      ),
    );
  });

  it("dit par le bandeau qu'une réinitialisation a été refusée", async () => {
    const without = [{ ...blocks[0], exercises: [] }];
    copiesMock.mockResolvedValue([{ ...copy(VERSION), blocks: without }]);
    resetMock.mockRejectedValue(new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE));
    const view = setup({ session: byBlocks() });

    await view.user.click(await view.findByRole("button", { name: "plan.composition.resetAll" }));
    await view.user.click(view.getByRole("button", { name: "plan.composition.resetConfirm" }));

    expect(await view.findByText("plan.composition.stale")).toBeInTheDocument();
  });

  it("dit par le bandeau qu'un geste a été refusé sur une version dépassée", async () => {
    composeMock.mockRejectedValue(
      new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE),
    );
    const view = setup({ session: byBlocks() });

    await addRower(view);

    expect(await view.findByText("plan.composition.stale")).toBeInTheDocument();
  });
});

describe("ScheduledSessionPanel — en Lecture (#607)", () => {
  it("la séance se consulte : champs figés, ni bibliothèque, ni retrait, « Fermer » seul", async () => {
    const view = setup({ session: session(), readOnly: true });

    expect(view.getByText("plan.session.readOnlyDescription")).toBeTruthy();
    expect((view.container.querySelector("#sessionTitle") as HTMLInputElement).disabled).toBe(true);
    expect((view.container.querySelector("#sessionNotes") as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    expect((view.container.querySelector("#scheduledDate") as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect(view.queryByText("common.requiredLegend")).toBeNull();
    expect(view.queryByText("plan.session.pickerTitle")).toBeNull();
    expect(view.queryByRole("button", { name: "plan.session.delete" })).toBeNull();
    expect(view.queryByRole("button", { name: "plan.session.submit" })).toBeNull();

    await view.user.click(view.getByText("common.close", { selector: "button" }));
    expect(view.onClose).toHaveBeenCalled();
  });
});
