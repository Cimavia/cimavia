import {
  DocumentUsage,
  type ExerciseDocumentDto,
  RichBlockType,
  type ScheduledSessionExerciseDto,
} from "@cmv/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { AthleteExerciseExtras } from "./AthleteExerciseExtras";

type Extras = Pick<ScheduledSessionExerciseDto, "instructions" | "documents">;

const document = (over: Partial<ExerciseDocumentDto>): ExerciseDocumentDto =>
  ({
    id: "doc-1",
    type: "PDF",
    usage: DocumentUsage.ATTACHMENT,
    url: "https://s3.test/doc-1",
    fileName: "Plan.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-09-01T08:00:00.000Z",
    ...over,
  }) as ExerciseDocumentDto;

function setup(over: Partial<Extras> = {}) {
  const exercise: Extras = {
    instructions: [{ type: RichBlockType.PARAGRAPH, content: [{ text: "Gainé." }] }],
    documents: [],
    ...over,
  } as Extras;
  return renderWithProviders(<AthleteExerciseExtras exercise={exercise} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AthleteExerciseExtras — la consigne", () => {
  // Le web est l'écran de lecture : la consigne est dépliée, l'athlète replie s'il veut.
  it("se lit dépliée, et se replie", async () => {
    const { user, getByRole, queryByText } = setup();
    expect(queryByText("Gainé.")).toBeInTheDocument();

    await user.click(getByRole("button", { name: "plan.athlete.hideInstructions" }));

    expect(queryByText("Gainé.")).toBeNull();
    expect(getByRole("button", { name: "plan.athlete.showInstructions" })).toBeInTheDocument();
  });

  it("n'offre aucun lien vers une consigne absente", () => {
    const { queryByRole } = setup({ instructions: null });

    expect(queryByRole("button", { name: "plan.athlete.hideInstructions" })).toBeNull();
  });

  it("résout ses images parmi les documents, et tait celle qui n'y est plus", () => {
    const { getAllByRole } = setup({
      instructions: [
        { type: RichBlockType.IMAGE, mediaId: "img-1", caption: "Prise" },
        { type: RichBlockType.IMAGE, mediaId: "img-gone", caption: "Disparue" },
      ],
      documents: [
        document({ id: "img-1", usage: DocumentUsage.INSTRUCTION, url: "https://s3.test/img-1" }),
      ],
    });

    const images = getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://s3.test/img-1");
  });
});

describe("AthleteExerciseExtras — les pièces jointes", () => {
  it("n'offre que les pièces jointes, pas les images de consigne", () => {
    const { getByRole, queryByRole } = setup({
      documents: [
        document({ id: "doc-1" }),
        document({ id: "img-1", usage: DocumentUsage.INSTRUCTION, fileName: "Schéma.png" }),
      ],
    });

    expect(getByRole("button", { name: "Plan.pdf" })).toBeInTheDocument();
    expect(queryByRole("button", { name: "Schéma.png" })).toBeNull();
  });

  it("ouvre la pièce dans un onglet détaché, nommée même sans nom de fichier", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { user, getByRole } = setup({ documents: [document({ fileName: null })] });

    await user.click(getByRole("button", { name: "plan.athlete.document" }));

    expect(open).toHaveBeenCalledWith("https://s3.test/doc-1", "_blank", "noopener");
  });
});
