import {
  BlockType,
  type ExerciseBlock,
  exerciseBlockSchema,
  MetricKey,
  MetricSource,
  MetricUnit,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import type { CompositionItem } from "@/feature/library/hook/useSessionDraft";
import { renderWithProviders } from "../../../../test/render";
import { SessionPreview } from "./SessionPreview";

const block = (id: string, label: string): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id,
    label,
    structure: { type: BlockType.FREE },
    metrics: [
      {
        id: `${id}-reps`,
        source: MetricSource.CATALOG,
        key: MetricKey.REPETITIONS,
        unit: MetricUnit.REPS,
        label: null,
        collapsed: false,
      },
    ],
    rows: [],
  });

const item = (key: string, title: string, note: string, blocks: ExerciseBlock[]) =>
  ({
    key,
    exerciseId: `ex-${key}`,
    title,
    tags: [],
    note,
    blocks,
    baseline: blocks,
    adjustments: {},
  }) as unknown as CompositionItem;

describe("SessionPreview", () => {
  it("dit ce qu'il attend tant que la séance est vide", () => {
    const { getByText, queryByRole } = renderWithProviders(
      <SessionPreview items={[]} customMetrics={[]} />,
    );

    expect(getByText("library.session.previewEmpty")).toBeInTheDocument();
    expect(queryByRole("heading")).not.toBeInTheDocument();
  });

  it("montre chaque exercice dans l'ordre, avec ses blocs et sa note", () => {
    const { getAllByRole, getByText, queryByText } = renderWithProviders(
      <SessionPreview
        items={[
          item("a", "Tractions", "Lestées 5 kg", [
            block("b1", "Échauffement"),
            block("b2", "Travail"),
          ]),
          item("b", "Gainage", "", [block("b3", "Planche")]),
        ]}
        customMetrics={[]}
      />,
    );

    expect(getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Tractions",
      "Gainage",
    ]);
    expect(getByText("Échauffement")).toBeInTheDocument();
    expect(getByText("Travail")).toBeInTheDocument();
    expect(getByText("Planche")).toBeInTheDocument();
    expect(getByText("Lestées 5 kg")).toBeInTheDocument();
    expect(queryByText("library.session.previewEmpty")).not.toBeInTheDocument();
  });

  // Une note faite d'espaces n'est pas une consigne : pas de paragraphe vide sous l'exercice.
  it("tait une note blanche", () => {
    const { getByRole } = renderWithProviders(
      <SessionPreview items={[item("a", "Tractions", "   ", [])]} customMetrics={[]} />,
    );

    expect(getByRole("heading").parentElement?.children).toHaveLength(1);
  });

  // Sans filet, deux exercices successifs se lisent comme un seul.
  it("sépare chaque exercice du précédent par un filet, pas le premier", () => {
    const { getAllByRole } = renderWithProviders(
      <SessionPreview
        items={[
          item("a", "Tractions", "", []),
          item("b", "Gainage", "", []),
          item("c", "Planche", "", []),
        ]}
        customMetrics={[]}
      />,
    );

    expect(
      getAllByRole("heading").map((heading) =>
        heading.parentElement?.classList.contains("border-t"),
      ),
    ).toEqual([false, true, true]);
  });
});
