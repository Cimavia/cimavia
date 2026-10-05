import {
  AdjustmentLevel,
  BlockType,
  cellPath,
  type ExerciseBlocks,
  MetricKey,
  MetricSource,
  MetricUnit,
  type PlanWeekDto,
  type ScheduledSessionDto,
} from "@cmv/shared";
import { waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ScheduledSessionPanel } from "./ScheduledSessionPanel";

const {
  createMock,
  updateMock,
  deleteMock,
  listSessionsMock,
  listExercisesMock,
  listCustomMetricsMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  listSessionsMock: vi.fn(),
  listExercisesMock: vi.fn(),
  listCustomMetricsMock: vi.fn(),
}));

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  createScheduledSession: createMock,
  updateScheduledSession: updateMock,
  deleteScheduledSession: deleteMock,
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

const week = { id: "week-1", startDate: "2026-09-07" } as PlanWeekDto;
const DATE = "2026-09-09";

/** Le snapshot que le panneau ne touche jamais, mais dont il est le seul à pouvoir le renvoyer. */
const snapshot = {
  instructions: { type: "doc", content: [] },
  blocks: [{ id: "b-1", label: null, structure: { type: "FREE" }, metrics: [], rows: [] }],
  customMetrics: [{ id: "cm-1", label: "Ressenti" }],
  adjustments: [{ path: "b-1/structure/setCount", level: "SCHEDULED" }],
};

/** La référence du dosage : le serveur la garde, le panneau la lit sans jamais la renvoyer. */
const reference = { baseline: snapshot.blocks, baselineAdjustments: [] };

const session = (over: Partial<ScheduledSessionDto> = {}): ScheduledSessionDto =>
  ({
    id: "ss-1",
    title: "Séance haute",
    notes: "Échauffement long",
    scheduledDate: DATE,
    exercises: [
      {
        id: "sx-1",
        sourceExerciseId: "ex-1",
        title: "Traction",
        description: null,
        tags: ["dos"],
        note: null,
        ...snapshot,
        ...reference,
      },
    ],
    ...over,
  }) as unknown as ScheduledSessionDto;

function setup(over: Partial<Parameters<typeof ScheduledSessionPanel>[0]> = {}) {
  const onClose = vi.fn();
  const onDirtyChange = vi.fn();
  const view = renderWithProviders(
    <ScheduledSessionPanel
      planId="plan-1"
      isPublished={false}
      week={week}
      date={DATE}
      session={null}
      athleteName="Léa Bonnet"
      onClose={onClose}
      onDirtyChange={onDirtyChange}
      {...over}
    />,
  );
  return { ...view, onClose, onDirtyChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  listSessionsMock.mockResolvedValue([{ id: "tpl-1", title: "Modèle force" }]);
  listExercisesMock.mockResolvedValue([]);
  listCustomMetricsMock.mockResolvedValue([]);
});

describe("ScheduledSessionPanel", () => {
  describe("à la création", () => {
    it("exige un titre tant qu'aucun modèle n'est choisi", () => {
      const { getByRole } = setup();

      // Sans modèle, la séance part vide : elle n'aurait rien à montrer à l'athlète.
      expect(getByRole("button", { name: SUBMIT })).toBeDisabled();
    });

    it("envoie le titre nettoyé et aucune séance source", async () => {
      createMock.mockResolvedValue(session());
      const { user, getByRole, onClose } = setup();

      await user.type(getByRole("textbox", { name: TITLE }), "  Séance haute  ");
      await user.click(getByRole("button", { name: SUBMIT }));

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith("week-1", {
          sourceSessionId: null,
          scheduledDate: DATE,
          title: "Séance haute",
        }),
      );
      expect(onClose).toHaveBeenCalled();
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
  });

  describe("à l'édition", () => {
    it("renvoie le snapshot INTÉGRAL de chaque exercice", async () => {
      updateMock.mockResolvedValue(session());
      const { user, getByRole } = setup({ session: session() });

      await user.click(getByRole("button", { name: SUBMIT }));

      // L'enregistrement est un replace-all : ce qui n'est pas émis est EFFACÉ. Omettre les
      // blocs d'une séance diffusée ne la laisserait pas telle quelle, elle ne dirait plus à
      // l'athlète ce qu'il doit faire. La référence, elle, ne part pas : le serveur la refuse.
      await waitFor(() => expect(updateMock).toHaveBeenCalled());
      const [, input] = updateMock.mock.calls[0] as [string, { exercises: unknown[] }];
      expect(input.exercises[0]).toEqual({
        id: "sx-1",
        sourceExerciseId: "ex-1",
        title: "Traction",
        description: null,
        tags: ["dos"],
        note: null,
        ...snapshot,
      });
    });

    it("omet les métriques maison que seul le serveur peut résoudre", async () => {
      updateMock.mockResolvedValue(session());
      const withoutCustom = session();
      // Une ligne ajoutée dans le panneau n'a pas de définitions maison : c'est le serveur qui
      // les résout depuis les métriques du coach, comme il le fait à la diffusion.
      (withoutCustom.exercises[0] as { customMetrics: unknown }).customMetrics = null;
      const { user, getByRole } = setup({ session: withoutCustom });

      await user.click(getByRole("button", { name: SUBMIT }));

      await waitFor(() => expect(updateMock).toHaveBeenCalled());
      const [, input] = updateMock.mock.calls[0] as [string, { exercises: object[] }];
      // La CLÉ est absente, et non présente à `null` : `null` demanderait au serveur d'effacer
      // les définitions, là où l'absence lui demande de les calculer.
      expect(input.exercises[0]).not.toHaveProperty("customMetrics");
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

      await waitFor(() => expect(updateMock).toHaveBeenCalled());
      expect(createMock).not.toHaveBeenCalled();
    });

    /**
     * L'exercice piocché est une COPIE : pas d'id — c'est le serveur qui en créera un —, sa
     * bibliothèque en trace, et aucune métrique maison, qu'il résoudra lui-même.
     */
    it("ajoute un exercice de la bibliothèque comme une copie neuve", async () => {
      updateMock.mockResolvedValue(session());
      listExercisesMock.mockResolvedValue([
        {
          id: "lib-9",
          title: "Gainage",
          description: "Planche",
          tags: ["core"],
          instructions: null,
          blocks: [],
        },
      ]);
      const { user, getByRole, findByRole } = setup({ session: session() });

      await user.click(await findByRole("button", { name: /Gainage/ }));
      await user.click(getByRole("button", { name: SUBMIT }));

      await waitFor(() => expect(updateMock).toHaveBeenCalled());
      const [, input] = updateMock.mock.calls[0] as [string, { exercises: object[] }];
      expect(input.exercises).toHaveLength(2);
      expect(input.exercises[1]).toEqual({
        sourceExerciseId: "lib-9",
        title: "Gainage",
        description: "Planche",
        tags: ["core"],
        note: null,
        instructions: null,
        blocks: [],
        adjustments: [],
      });
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

      await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("ss-1"));
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
 * #518, le scénario de l'issue : Tractions lestées passées à +12 dans la séance-type (● rond),
 * diffusées à Léa. Le coach met +14 pour elle (■ carré), puis revient : +12 ET le rond.
 */
describe("ScheduledSessionPanel — dosage ajusté pour l'athlète (#518)", () => {
  const REVERT = "library.session.revert";
  const RESET_ALL = "library.session.resetAll";
  const INHERITED = "library.dosage.inherited";
  const ADJUSTED_FOR = "plan.session.dosage.adjustedFor";
  const VALUES_FOR = "plan.session.dosage.valuesFor";
  const LOAD = cellPath("blk", "r1", "load");

  const tractions: ExerciseBlocks = [
    {
      id: "blk",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [
        {
          id: "load",
          source: MetricSource.CATALOG,
          key: MetricKey.REPETITIONS,
          unit: MetricUnit.REPS,
          label: null,
          collapsed: false,
        },
      ],
      rows: [{ id: "r1", values: { load: 12 } }],
    },
  ];
  const received = [{ path: LOAD, level: AdjustmentLevel.SESSION }];

  const forLea = (over: Partial<ScheduledSessionDto> = {}) =>
    session({
      sourceSessionId: "tpl-1",
      exercises: [
        {
          id: "sx-1",
          sourceExerciseId: "ex-1",
          title: "Tractions lestées",
          description: null,
          tags: [],
          note: null,
          instructions: null,
          customMetrics: [],
          blocks: tractions,
          baseline: tractions,
          adjustments: received,
          baselineAdjustments: received,
        },
      ] as unknown as ScheduledSessionDto["exercises"],
      ...over,
    });

  /** Ouvre la grille des Tractions et y tape une valeur. */
  async function open(over: Partial<ScheduledSessionDto> = {}) {
    const view = setup({ session: forLea(over) });
    await view.user.click(view.getByRole("button", { name: "Tractions lestées" }));
    const cell = () => within(view.getByRole("table")).getAllByRole("textbox")[0] as HTMLElement;
    async function type(value: string) {
      await view.user.clear(cell());
      await view.user.type(cell(), value);
      await view.user.tab();
    }
    return { ...view, cell, type };
  }

  it("replie la grille, et montre la valeur reçue de la séance sans offrir d'y revenir", async () => {
    const view = setup({ session: forLea() });
    expect(view.queryByRole("table")).not.toBeInTheDocument();

    await view.user.click(view.getByRole("button", { name: "Tractions lestées" }));

    expect(view.getByText(INHERITED)).toBeInTheDocument();
    expect(view.queryByRole("button", { name: REVERT })).not.toBeInTheDocument();
    // Rien d'ajusté pour Léa : ni décompte, ni réinitialisation à offrir.
    expect(view.queryByText(ADJUSTED_FOR)).not.toBeInTheDocument();
    expect(view.queryByText(VALUES_FOR)).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: RESET_ALL })).toBeDisabled();
  });

  it("ajuste une valeur pour l'athlète, puis « Revenir » rend celle de la séance et son rond", async () => {
    const view = await open();

    await view.type("14");
    expect(view.getByText(ADJUSTED_FOR)).toBeInTheDocument();
    expect(view.getByText(VALUES_FOR)).toBeInTheDocument();
    expect(view.queryByText(INHERITED)).not.toBeInTheDocument();

    await view.user.click(view.getByRole("button", { name: REVERT }));

    expect(view.cell()).toHaveValue("12");
    expect(view.getByText(INHERITED)).toBeInTheDocument();
    expect(view.queryByText(ADJUSTED_FOR)).not.toBeInTheDocument();
  });

  it("« Tout réinitialiser » rend ce que la séance a diffusé, marqueurs reçus compris", async () => {
    const view = await open();
    await view.type("14");

    await view.user.click(view.getByRole("button", { name: RESET_ALL }));

    expect(view.cell()).toHaveValue("12");
    expect(view.getByText(INHERITED)).toBeInTheDocument();
  });

  it("enregistre la valeur ajustée et son carré, sans renvoyer la référence", async () => {
    updateMock.mockResolvedValue(forLea());
    const view = await open();
    await view.type("14");

    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const [, input] = updateMock.mock.calls[0] as [string, { exercises: object[] }];
    const [line] = input.exercises;
    expect(line).toMatchObject({
      id: "sx-1",
      blocks: [{ rows: [{ id: "r1", values: { load: 14 } }] }],
      adjustments: [{ path: LOAD, level: AdjustmentLevel.SCHEDULED }],
    });
    expect(line).not.toHaveProperty("baseline");
    expect(line).not.toHaveProperty("baselineAdjustments");
  });

  it("ferme l'enregistrement tant qu'une valeur est refusée", async () => {
    const view = await open();

    await view.type("14kgg");

    const submit = view.getByRole("button", { name: SUBMIT });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("title", "library.builder.refusedBlocksSave");
  });

  it("n'envoie rien quand Entrée soumet une valeur refusée", async () => {
    const view = await open();
    await view.user.clear(view.cell());
    await view.user.type(view.cell(), "14kgg{Enter}");

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("ouvre la séance-type dans un autre onglet", () => {
    const { getByRole } = setup({ session: forLea() });

    const link = getByRole("link", { name: "plan.session.dosage.viewTemplate" });
    expect(link).toHaveAttribute("href", "/library/sessions/tpl-1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  // La trace vers la séance-type est `SetNull` : une séance ad hoc, ou dont le modèle a été
  // supprimé, n'a rien à ouvrir.
  it("ne propose pas la séance-type quand il n'y en a plus", () => {
    const { queryByRole, getByText } = setup({
      session: forLea({ sourceSessionId: null }),
      athleteName: null,
    });

    expect(queryByRole("link", { name: "plan.session.dosage.viewTemplate" })).toBeNull();
    // Sans destinataire, la légende parle encore — de « l'athlète ».
    expect(getByText("plan.session.dosage.legendScheduled")).toBeInTheDocument();
  });

  // Un exercice ajouté ici n'a pas de référence : rien à quoi revenir, donc aucun marqueur.
  it("n'ajuste rien sur un exercice ajouté dans le panneau", async () => {
    listExercisesMock.mockResolvedValue([
      {
        id: "lib-9",
        title: "Gainage",
        description: null,
        tags: [],
        instructions: null,
        blocks: tractions,
      },
    ]);
    const view = setup({ session: forLea({ exercises: [] }) });
    await view.user.click(await view.findByRole("button", { name: /Gainage/ }));
    await view.user.click(view.getByRole("button", { name: "Gainage", expanded: false }));

    const cell = within(view.getByRole("table")).getAllByRole("textbox")[0] as HTMLElement;
    await view.user.clear(cell);
    await view.user.type(cell, "20");
    await view.user.tab();

    expect(view.queryByText(VALUES_FOR)).not.toBeInTheDocument();
    expect(view.queryByRole("button", { name: REVERT })).not.toBeInTheDocument();
  });
});

/** #518, **G-1** : le panneau porte une grille de dosage par exercice, la refermer demande. */
describe("ScheduledSessionPanel — fermer une saisie non enregistrée", () => {
  const CANCEL = "common.cancel";
  const LEAVE_TITLE = "common.leave.title";

  it("se ferme sans rien demander tant que rien n'a changé", async () => {
    const { user, getByRole, queryByText, onClose, onDirtyChange } = setup({ session: session() });

    await user.click(getByRole("button", { name: CANCEL }));

    expect(queryByText(LEAVE_TITLE)).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it("ne retient rien pour une espace ajoutée au titre", async () => {
    const { user, getByRole, onClose } = setup({ session: session() });

    await user.type(getByRole("textbox", { name: TITLE }), " ");
    await user.click(getByRole("button", { name: CANCEL }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("demande avant de perdre la saisie, et « Rester » la garde", async () => {
    const { user, getByLabelText, getByRole, queryByText, onClose, onDirtyChange } = setup({
      session: session(),
    });

    await user.type(getByLabelText(NOTES), " et les poignets");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(getByRole("button", { name: CANCEL }));

    expect(queryByText(LEAVE_TITLE)).toBeInTheDocument();
    await user.click(getByRole("button", { name: "common.leave.stay", hidden: true }));

    expect(onClose).not.toHaveBeenCalled();
    expect(queryByText(LEAVE_TITLE)).not.toBeInTheDocument();
    expect(getByLabelText(NOTES)).toHaveValue("Échauffement long et les poignets");
  });

  it("referme sur « Quitter sans enregistrer »", async () => {
    const { user, getByLabelText, getByRole, onClose } = setup({ session: session() });

    await user.type(getByLabelText(NOTES), " et les poignets");
    await user.click(getByRole("button", { name: CANCEL }));
    await user.click(getByRole("button", { name: "common.leave.leave", hidden: true }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("garde aussi une séance en cours de création", async () => {
    const { user, getByRole, queryByText, onClose } = setup();

    await user.type(getByRole("textbox", { name: TITLE }), "Séance haute");
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
