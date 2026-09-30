import { DocumentUsage, type ExerciseDto } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ExerciseCard } from "./ExerciseCard";

const DOCUMENTS = "library.card.documentCount";

const exercise = (overrides: Partial<ExerciseDto> = {}) =>
  ({
    id: "ex-1",
    title: "Tractions",
    description: "Prise pronation",
    tags: ["force", "dos"],
    documents: [],
    ...overrides,
  }) as unknown as ExerciseDto;

const document = (usage: DocumentUsage) => ({ id: crypto.randomUUID(), usage });

function setup(overrides: Partial<ExerciseDto> = {}) {
  const onSelect = vi.fn();
  return {
    ...renderWithProviders(<ExerciseCard exercise={exercise(overrides)} onSelect={onSelect} />),
    onSelect,
  };
}

describe("ExerciseCard", () => {
  it("montre le titre, la description et les tags de l'exercice", () => {
    const { getByRole, getByText } = setup();

    expect(getByRole("heading", { name: "Tractions" })).toBeInTheDocument();
    expect(getByText("Prise pronation")).toBeInTheDocument();
    expect(getByText("force")).toBeInTheDocument();
    expect(getByText("dos")).toBeInTheDocument();
  });

  // Règle dure n°5 : une description absente se lit comme telle, pas comme une chaîne vide.
  it("montre un tiret quand l'exercice n'a pas de description", () => {
    const { getByText } = setup({ description: null });

    expect(getByText("—")).toBeInTheDocument();
  });

  it("annonce les pièces jointes", () => {
    const { getByText } = setup({
      documents: [document(DocumentUsage.ATTACHMENT)],
    } as Partial<ExerciseDto>);

    expect(getByText(DOCUMENTS)).toBeInTheDocument();
  });

  // Une image posée dans la consigne n'est pas une pièce jointe : la compter annoncerait un
  // document que le coach ne retrouverait nulle part.
  it("n'annonce rien quand les seuls documents sont des images de la consigne", () => {
    const { queryByText } = setup({
      documents: [document(DocumentUsage.INSTRUCTION), document(DocumentUsage.INSTRUCTION)],
    } as Partial<ExerciseDto>);

    expect(queryByText(DOCUMENTS)).not.toBeInTheDocument();
  });

  it("n'annonce rien sans document", () => {
    expect(setup().queryByText(DOCUMENTS)).not.toBeInTheDocument();
  });

  it("s'ouvre au clic", async () => {
    const { user, getByRole, onSelect } = setup();

    await user.click(getByRole("button"));

    expect(onSelect).toHaveBeenCalledOnce();
  });
});
