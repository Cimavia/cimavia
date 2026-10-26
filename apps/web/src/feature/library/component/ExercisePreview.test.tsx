import {
  type CustomMetric,
  DocumentType,
  DocumentUsage,
  type ExerciseDocumentDto,
  MetricKey,
  MetricSource,
  MetricUnit,
  RichBlockType,
  type SuggestedMetric,
} from "@cmv/shared";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ExercisePreview } from "./ExercisePreview";

const reps: SuggestedMetric = {
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
};
const load: SuggestedMetric = {
  source: MetricSource.CATALOG,
  key: MetricKey.LOAD,
  unit: MetricUnit.KILOGRAMS,
};
const ressenti = { id: "cm-1", label: "Ressenti" } as CustomMetric;

const document = (overrides: Partial<ExerciseDocumentDto>): ExerciseDocumentDto => ({
  id: crypto.randomUUID(),
  type: DocumentType.FILE,
  usage: DocumentUsage.ATTACHMENT,
  url: "https://stockage.example/doc",
  fileName: null,
  mimeType: null,
  createdAt: "2026-09-30T08:00:00.000Z",
  ...overrides,
});

function setup(overrides: Partial<ComponentProps<typeof ExercisePreview>> = {}) {
  return renderWithProviders(
    <ExercisePreview
      title="Tractions"
      tags={["force"]}
      instructions={[{ type: RichBlockType.PARAGRAPH, content: [{ text: "Omoplates serrées" }] }]}
      suggestedMetrics={[]}
      customMetrics={[]}
      documents={[]}
      resolveImage={() => null}
      {...overrides}
    />,
  );
}

const links = (view: ReturnType<typeof setup>) =>
  view.queryAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);

describe("ExercisePreview", () => {
  // Une carte sans titre se lirait comme un exercice vide : l'aperçu dit ce qu'il attend.
  it("dit ce qu'il attend tant que l'exercice n'a pas de titre", () => {
    const { getByText, queryByText } = setup({ title: "" });

    expect(getByText("library.builder.previewEmpty")).toBeInTheDocument();
    expect(queryByText("Omoplates serrées")).not.toBeInTheDocument();
  });

  it("montre le titre, les tags et la consigne", () => {
    const { getByRole, getByText, queryByText } = setup();

    expect(getByRole("heading", { name: "Tractions" })).toBeInTheDocument();
    expect(getByText("force")).toBeInTheDocument();
    expect(getByText("Omoplates serrées")).toBeInTheDocument();
    expect(queryByText("library.builder.previewEmpty")).not.toBeInTheDocument();
  });

  it("montre les métriques suggérées en puces, dans leur ordre, maison comprise", () => {
    const { getAllByRole, getByText } = setup({
      suggestedMetrics: [reps, { source: MetricSource.CUSTOM, customMetricId: "cm-1" }, load],
      customMetrics: [ressenti],
    });

    expect(getByText("library.builder.suggested.title")).toBeInTheDocument();
    expect(getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "exercise.metric.repetitions",
      "Ressenti",
      "exercise.metric.load",
    ]);
  });

  // « Étirements au ressenti » : sans métrique, ni intitulé ni liste vide.
  it("ne dit rien des métriques quand l'exercice n'en suggère aucune", () => {
    const { queryByRole, queryByText } = setup();

    expect(queryByText("library.builder.suggested.title")).not.toBeInTheDocument();
    expect(queryByRole("list")).not.toBeInTheDocument();
  });

  it("n'offre aucun lien sans pièce jointe", () => {
    expect(links(setup())).toEqual([]);
  });

  // Les images de consigne sont DANS le texte : les relister en pièce jointe les doublerait.
  it("ne liste que les pièces jointes, pas les images de la consigne", () => {
    const view = setup({
      documents: [
        document({ usage: DocumentUsage.INSTRUCTION, fileName: "schema.png" }),
        document({ fileName: "programme.pdf", url: "https://stockage.example/programme" }),
      ],
    });

    expect(links(view)).toEqual([["programme.pdf", "https://stockage.example/programme"]]);
  });

  it("nomme un lien sans nom par son adresse, un fichier sans nom par sa nature", () => {
    const view = setup({
      documents: [
        document({ type: DocumentType.LINK, url: "https://video.example/tuto" }),
        document({ type: DocumentType.FILE, url: "https://stockage.example/f" }),
      ],
    });

    expect(links(view)).toEqual([
      ["https://video.example/tuto", "https://video.example/tuto"],
      ["library.builder.attachment.file", "https://stockage.example/f"],
    ]);
  });

  it("ouvre les pièces jointes dans un nouvel onglet, sans lui céder la page", () => {
    const [link] = setup({ documents: [document({ fileName: "programme.pdf" })] }).getAllByRole(
      "link",
    );

    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
