import type { PlanWeekDto, ScheduledSessionDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ScheduledSessionPanel } from "./ScheduledSessionPanel";

const { createMock, updateMock, deleteMock, listSessionsMock, listExercisesMock } = vi.hoisted(
  () => ({
    createMock: vi.fn(),
    updateMock: vi.fn(),
    deleteMock: vi.fn(),
    listSessionsMock: vi.fn(),
    listExercisesMock: vi.fn(),
  }),
);

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  createScheduledSession: createMock,
  updateScheduledSession: updateMock,
  deleteScheduledSession: deleteMock,
}));

// La bibliothèque n'est pas le sujet ici : ses deux listes sont des ENTRÉES du panneau.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  listSessions: listSessionsMock,
  listExercises: listExercisesMock,
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
      },
    ],
    ...over,
  }) as unknown as ScheduledSessionDto;

function setup(over: Partial<Parameters<typeof ScheduledSessionPanel>[0]> = {}) {
  const onClose = vi.fn();
  const view = renderWithProviders(
    <ScheduledSessionPanel
      planId="plan-1"
      week={week}
      date={DATE}
      session={null}
      onClose={onClose}
      {...over}
    />,
  );
  return { ...view, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  listSessionsMock.mockResolvedValue([{ id: "tpl-1", title: "Modèle force" }]);
  listExercisesMock.mockResolvedValue([]);
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
      // l'athlète ce qu'il doit faire.
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
  });
});
