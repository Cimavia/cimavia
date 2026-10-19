import {
  AdjustmentLevel,
  BlockType,
  cellPath,
  type ExerciseBlocks,
  MetricKey,
  MetricSource,
  MetricUnit,
  type PlanWeekDto,
  required,
  type ScheduledSessionDto,
  SESSION_NOTES_MAX_LENGTH,
  SESSION_TITLE_MAX_LENGTH,
  STALE_WRITE,
  structurePath,
} from "@cmv/shared";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api";
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
// La version de la séance à l'ouverture : celle qu'enregistrer et supprimer citent (#604).
const VERSION = "2026-09-01T10:00:00.000Z";

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
    updatedAt: VERSION,
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
  const onUnsavedChange = vi.fn();
  const onReload = vi.fn();
  const view = renderWithProviders(
    <ScheduledSessionPanel
      planId="plan-1"
      isPublished={false}
      readOnly={false}
      week={week}
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
});

describe("ScheduledSessionPanel", () => {
  describe("à la création", () => {
    it("exige un titre tant qu'aucun modèle n'est choisi", () => {
      const { getByRole } = setup();

      // Sans modèle, la séance part vide : elle n'aurait rien à montrer à l'athlète.
      expect(getByRole("button", { name: SUBMIT })).toBeDisabled();
    });

    it("borne le titre à ce que l'API accepte (#319)", () => {
      const { getByRole } = setup();

      expect(getByRole("textbox", { name: TITLE })).toHaveAttribute(
        "maxLength",
        String(SESSION_TITLE_MAX_LENGTH),
      );
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

    /**
     * L'exercice piocché est une COPIE : pas d'id — c'est le serveur qui en créera un —, sa
     * bibliothèque en trace, et aucune métrique maison, qu'il résoudra lui-même — pas même celles
     * que l'exercice apporte pour s'afficher.
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
          customMetrics: [{ id: "cm-9", label: "Prises" }],
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
  const stale = () => new ApiError(409, STALE_WRITE, null);

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
    expect(queryByText(STALE_WRITE)).not.toBeInTheDocument();
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
        week={week}
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

  // Le bouton fermé ne suffit pas : Entrée dans un champ du formulaire le soumet sans lui.
  it("n'envoie rien quand le formulaire est soumis avec une valeur refusée", async () => {
    const view = await open();
    await view.type("14kgg");

    fireEvent.submit(required(document.querySelector("form"), "formulaire du panneau"));

    // L'envoi est asynchrone : affirmer tout de suite qu'il n'est pas parti ne prouverait rien.
    await expect(
      waitFor(() => expect(updateMock).toHaveBeenCalled(), { timeout: 300 }),
    ).rejects.toThrow();
  });

  it("ajoute une ligne sans poser de marqueur, et l'enregistre", async () => {
    updateMock.mockResolvedValue(forLea());
    const view = await open();

    await view.user.click(view.getByRole("button", { name: "library.builder.grid.addRow" }));

    // Une ligne ajoutée n'est dans aucune référence : elle ne s'écarte d'aucun défaut.
    expect(within(view.getByRole("table")).getAllByRole("textbox")).toHaveLength(2);
    expect(view.queryByText(VALUES_FOR)).not.toBeInTheDocument();
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const [, input] = updateMock.mock.calls[0] as [
      string,
      { exercises: { blocks: ExerciseBlocks; adjustments: unknown }[] },
    ];
    expect(input.exercises[0]?.blocks[0]?.rows).toHaveLength(2);
    expect(input.exercises[0]?.adjustments).toEqual(received);
  });

  it("ajuste le nombre de séries pour l'athlète, puis revient à celui de la séance", async () => {
    const SET_COUNT = "library.builder.bandeau.setCount";
    const series = [
      {
        ...(tractions[0] as ExerciseBlocks[number]),
        structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
      },
    ];
    // La séance-type a passé les séries de 3 à 4 : le rond est sur le bandeau, pas sur une cellule.
    const fromTemplate = [
      { path: structurePath("blk", "setCount"), level: AdjustmentLevel.SESSION },
    ];
    const exercise = forLea().exercises[0] as ScheduledSessionDto["exercises"][number];
    const view = setup({
      session: forLea({
        exercises: [
          {
            ...exercise,
            blocks: series,
            baseline: series,
            adjustments: fromTemplate,
            baselineAdjustments: fromTemplate,
          },
        ],
      }),
    });
    await view.user.click(view.getByRole("button", { name: "Tractions lestées" }));
    const setCount = () => view.getByRole("spinbutton", { name: SET_COUNT });

    fireEvent.change(setCount(), { target: { value: "5" } });

    expect(setCount()).toHaveValue(5);
    expect(view.getByText(VALUES_FOR)).toBeInTheDocument();
    expect(view.queryByText(INHERITED)).not.toBeInTheDocument();

    await view.user.click(view.getByRole("button", { name: REVERT }));

    expect(setCount()).toHaveValue(4);
    expect(view.getByText(INHERITED)).toBeInTheDocument();
    expect(view.queryByText(VALUES_FOR)).not.toBeInTheDocument();
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

  // L'exercice d'un autre Coach cite SON catalogue (#605), que celui du lecteur ignore.
  it("nomme les colonnes d'un exercice ajouté par les métriques de son propriétaire", async () => {
    listCustomMetricsMock.mockResolvedValue([]);
    listExercisesMock.mockResolvedValue([
      {
        id: "lib-m",
        title: "Pan Güllich",
        description: null,
        tags: [],
        instructions: null,
        blocks: [
          {
            id: "blk-m",
            label: null,
            structure: { type: BlockType.FREE },
            metrics: [
              {
                id: "c-m",
                source: MetricSource.CUSTOM,
                customMetricId: "cm-m",
                label: null,
                collapsed: false,
              },
            ],
            rows: [{ id: "r-m", values: { "c-m": 12 } }],
          },
        ],
        customMetrics: [
          { id: "cm-m", label: "Prises", unit: null, valueType: "NUMBER", scale: null },
        ],
      },
    ]);
    const view = setup({ session: forLea({ exercises: [] }) });
    await view.user.click(await view.findByRole("button", { name: /Pan Güllich/ }));
    await view.user.click(view.getByRole("button", { name: "Pan Güllich", expanded: false }));

    expect(within(view.getByRole("table")).getByText(/Prises/)).toBeInTheDocument();
  });
});

/** #518, **G-1** : le panneau porte une grille de dosage par exercice, la refermer demande. */
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
    updateMock.mockRejectedValue(new ApiError(409, STALE_WRITE, null));
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

  // Un jour choisi sans modèle ni titre : la saisie compte, mais la séance ne peut pas naître.
  it("dit pourquoi une séance sans modèle ni titre ne s'enregistre pas", async () => {
    const { user, getByLabelText, getByRole, findByText, onClose, onUnsavedChange } = setup();

    await user.selectOptions(getByLabelText("plan.session.day"), "2026-09-10");
    await user.click(getByRole("button", { name: CANCEL }));
    await user.click(getByRole("button", { name: "common.leave.save", hidden: true }));

    expect(await findByText("plan.session.titleRequired")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUnsavedChange).toHaveBeenLastCalledWith(expect.any(Function));
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
