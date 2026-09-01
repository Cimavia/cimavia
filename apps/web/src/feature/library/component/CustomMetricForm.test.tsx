import { ApiError, type CustomMetric, MetricValueType } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { CustomMetricForm } from "./CustomMetricForm";

const { createMock, updateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
}));

// Seuls les deux appels réseau sont remplacés : `customMetricKeys` reste le VRAI, sinon
// l'invalidation porterait sur une clé de cache que le test aurait lui-même inventée.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  createCustomMetric: createMock,
  updateCustomMetric: updateMock,
}));

const LABEL = "library.builder.custom.label";
const UNIT = "library.builder.custom.unit";
const SUBMIT = "library.builder.custom.submit";
const UPDATE = "library.builder.custom.update";
const SCALE_FR = "library.builder.scale.duplicateFrench";

const metric = (over: Partial<CustomMetric> = {}): CustomMetric =>
  ({
    id: "cm-1",
    label: "Cotation maison",
    unit: null,
    valueType: MetricValueType.NUMBER,
    scale: null,
    ...over,
  }) as CustomMetric;

function setup(editing: CustomMetric | null = null) {
  const handlers = { onCreated: vi.fn(), onUpdated: vi.fn(), onCancelEdit: vi.fn() };
  const view = renderWithProviders(<CustomMetricForm editing={editing} {...handlers} />);
  return { ...view, ...handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CustomMetricForm", () => {
  describe("ce qui autorise l'envoi", () => {
    it("refuse un libellé vide", () => {
      const { getByRole } = setup();

      // Le libellé EST le nom de la cotation : sans lui, la colonne n'aurait rien à afficher en
      // en-tête et le coach ne la retrouverait plus dans sa liste.
      expect(getByRole("button", { name: SUBMIT })).toBeDisabled();
    });

    it("refuse une échelle de moins de deux paliers", async () => {
      const { user, getByRole, getByLabelText } = setup();

      await user.type(getByLabelText(LABEL), "Ressenti");
      await user.click(getByRole("button", { name: "library.builder.valueType.SCALE" }));

      // Un seul palier ne se compare à rien : l'échelle n'ordonnerait rien, et « progression sur
      // l'échelle » perdrait son sens.
      expect(getByRole("button", { name: SUBMIT })).toBeDisabled();
    });

    it("autorise l'envoi une fois l'échelle remplie", async () => {
      const { user, getByRole, getByLabelText } = setup();

      await user.type(getByLabelText(LABEL), "Cotation");
      await user.click(getByRole("button", { name: "library.builder.valueType.SCALE" }));
      await user.click(getByRole("button", { name: SCALE_FR }));

      expect(getByRole("button", { name: SUBMIT })).toBeEnabled();
    });
  });

  describe("ce qui part au serveur", () => {
    it("envoie null plutôt qu'une unité vide", async () => {
      createMock.mockResolvedValue(metric());
      const { user, getByRole, getByLabelText } = setup();

      await user.type(getByLabelText(LABEL), "  Fatigue  ");
      await user.click(getByRole("button", { name: SUBMIT }));

      // `""` s'afficherait comme un espace collé au nombre ; l'absence d'unité est une donnée,
      // pas une chaîne vide (règle dure n°5).
      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith({
          label: "Fatigue",
          unit: null,
          valueType: MetricValueType.NUMBER,
          scale: null,
        }),
      );
    });

    it("n'envoie pas de paliers hors du type échelle", async () => {
      createMock.mockResolvedValue(metric());
      const { user, getByRole, getByLabelText } = setup();

      await user.type(getByLabelText(LABEL), "Charge");
      await user.type(getByLabelText(UNIT), "kg");
      // Des paliers saisis PUIS abandonnés au profit d'un autre type : ils ne doivent pas suivre.
      await user.click(getByRole("button", { name: "library.builder.valueType.SCALE" }));
      await user.click(getByRole("button", { name: SCALE_FR }));
      await user.click(getByRole("button", { name: "library.builder.valueType.NUMBER" }));
      await user.click(getByRole("button", { name: SUBMIT }));

      // L'invariant d'`exerciseMetricSchema` : des paliers si et SEULEMENT si le type est SCALE.
      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith(
          expect.objectContaining({ unit: "kg", valueType: MetricValueType.NUMBER, scale: null }),
        ),
      );
    });
  });

  describe("après le serveur", () => {
    it("remonte la métrique créée et vide le formulaire", async () => {
      const created = metric({ id: "cm-neuve", label: "Fatigue" });
      createMock.mockResolvedValue(created);
      const { user, getByRole, getByLabelText, onCreated } = setup();

      await user.type(getByLabelText(LABEL), "Fatigue");
      await user.click(getByRole("button", { name: SUBMIT }));

      // C'est le SERVEUR qui attribue l'identifiant, et c'est lui que le picker pose aussitôt en
      // colonne : remonter la saisie locale poserait une colonne sans identité.
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
      expect(getByLabelText(LABEL)).toHaveValue("");
    });

    it("affiche le message de l'API quand la création échoue", async () => {
      createMock.mockRejectedValue(new ApiError(409, "Cotation déjà nommée ainsi", null));
      const { user, getByRole, getByLabelText, findByText } = setup();

      await user.type(getByLabelText(LABEL), "Fatigue");
      await user.click(getByRole("button", { name: SUBMIT }));

      // Le message de l'API est déjà actionnable ; le remplacer par un générique ferait perdre la
      // seule chose que le coach peut corriger.
      expect(await findByText("Cotation déjà nommée ainsi")).toBeInTheDocument();
    });
  });

  describe("en modification", () => {
    it("part de la métrique à modifier", () => {
      const { getByLabelText, getByRole } = setup(
        metric({ label: "Ressenti", unit: "/10", valueType: MetricValueType.NUMBER }),
      );

      expect(getByLabelText(LABEL)).toHaveValue("Ressenti");
      expect(getByLabelText(UNIT)).toHaveValue("/10");
      expect(getByRole("button", { name: UPDATE })).toBeInTheDocument();
    });

    it("ne recharge pas le formulaire à chaque frappe", async () => {
      const editing = metric({ label: "Ressenti" });
      const { user, getByLabelText, rerender } = setup(editing);

      await user.clear(getByLabelText(LABEL));
      await user.type(getByLabelText(LABEL), "Ressenti global");
      // Un rendu déclenché par autre chose (une requête d'arrière-plan, un état du parent) sur la
      // MÊME métrique : la saisie en cours doit survivre.
      rerender(
        <CustomMetricForm
          editing={editing}
          onCreated={vi.fn()}
          onUpdated={vi.fn()}
          onCancelEdit={vi.fn()}
        />,
      );

      expect(getByLabelText(LABEL)).toHaveValue("Ressenti global");
    });

    it("envoie la modification sur l'identifiant existant", async () => {
      updateMock.mockResolvedValue(metric({ label: "Ressenti global" }));
      const { user, getByLabelText, getByRole, onUpdated } = setup(metric({ label: "Ressenti" }));

      await user.type(getByLabelText(LABEL), " global");
      await user.click(getByRole("button", { name: UPDATE }));

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(
          "cm-1",
          expect.objectContaining({ label: "Ressenti global" }),
        ),
      );
      expect(onUpdated).toHaveBeenCalled();
    });

    it("rend la main et vide le formulaire à l'annulation", async () => {
      const { user, getByRole, getByLabelText, onCancelEdit } = setup(
        metric({ label: "Ressenti" }),
      );

      await user.click(getByRole("button", { name: "library.builder.cancel" }));

      expect(onCancelEdit).toHaveBeenCalled();
      expect(getByLabelText(LABEL)).toHaveValue("");
    });
  });
});
