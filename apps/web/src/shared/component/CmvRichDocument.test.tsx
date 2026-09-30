import { InlineMark, type RichBlock, RichBlockType } from "@cmv/shared";
import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CmvRichDocument, IMAGE_WIDTH_CLASSES } from "./CmvRichDocument";

const paragraph = (text: string): RichBlock => ({
  type: RichBlockType.PARAGRAPH,
  content: [{ text }],
});

describe("CmvRichDocument — une consigne absente", () => {
  it.each([
    ["null", null],
    ["vide", []],
  ])("ne rend rien quand elle vaut %s", (_, blocks) => {
    const { container } = render(<CmvRichDocument blocks={blocks} />);

    // Pas de « aucune consigne » : l'absence est légitime, la signaler serait du bruit.
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CmvRichDocument — les blocs de texte", () => {
  it("rend le titre de section, le paragraphe et l'encadré", () => {
    const { getByRole, getByText } = render(
      <CmvRichDocument
        blocks={[
          { type: RichBlockType.HEADING, content: [{ text: "Mise en place" }] },
          paragraph("Pieds à plat."),
          { type: RichBlockType.CALLOUT, content: [{ text: "Ne jamais verrouiller." }] },
        ]}
      />,
    );

    expect(getByRole("heading", { name: "Mise en place" })).toBeInTheDocument();
    expect(getByText("Pieds à plat.").tagName).toBe("P");
    expect(getByRole("complementary")).toHaveTextContent("Ne jamais verrouiller.");
  });

  it("pose les marques sur le fragment, et laisse nu le texte qui n'en a pas", () => {
    const { getByText } = render(
      <CmvRichDocument
        blocks={[
          {
            type: RichBlockType.PARAGRAPH,
            content: [
              { text: "Tirer " },
              { text: "fort", marks: [InlineMark.BOLD, InlineMark.UNDERLINE] },
            ],
          },
        ]}
      />,
    );

    expect(getByText("fort")).toHaveClass("font-semibold", "underline");
    // Aucun `<span>` vide autour d'un texte sans marque : il est le paragraphe lui-même.
    expect(getByText("Tirer", { exact: false }).tagName).toBe("P");
  });

  it("ouvre un lien dans un nouvel onglet, sans transmettre la page d'origine", () => {
    const { getByRole } = render(
      <CmvRichDocument
        blocks={[
          {
            type: RichBlockType.PARAGRAPH,
            content: [
              { text: "la vidéo", href: "https://exemple.fr/v", marks: [InlineMark.ITALIC] },
            ],
          },
        ]}
      />,
    );

    const link = getByRole("link", { name: "la vidéo" });
    expect(link).toHaveAttribute("href", "https://exemple.fr/v");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveClass("italic");
  });
});

describe("CmvRichDocument — les listes", () => {
  it.each([
    [true, "OL"],
    [false, "UL"],
  ])("ordered=%s rend une liste %s", (ordered, tagName) => {
    const { getByRole } = render(
      <CmvRichDocument
        blocks={[
          { type: RichBlockType.LIST, ordered, items: [[{ text: "Un" }], [{ text: "Deux" }]] },
        ]}
      />,
    );

    const list = getByRole("list");
    expect(list.tagName).toBe(tagName);
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Un", "Deux"]);
  });
});

/**
 * Un nœud de document n'a pas d'identifiant : sa clé de rendu est son index. #504 la remettra en
 * question (S6479). Ces cas sont ceux qu'une clé tirée du CONTENU casserait — deux frères
 * identiques qui entrent en collision, et un retrait qui ferait survivre le mauvais.
 */
describe("CmvRichDocument — des frères identiques", () => {
  it("rend chacun de deux paragraphes au même texte", () => {
    const { getAllByText } = render(
      <CmvRichDocument blocks={[paragraph("Respirer."), paragraph("Respirer.")]} />,
    );

    expect(getAllByText("Respirer.")).toHaveLength(2);
  });

  it("rend chacun de deux items et de deux fragments identiques", () => {
    const { getAllByRole, getByText } = render(
      <CmvRichDocument
        blocks={[
          {
            type: RichBlockType.LIST,
            ordered: false,
            items: [[{ text: "Rep" }], [{ text: "Rep" }]],
          },
          {
            type: RichBlockType.PARAGRAPH,
            content: [
              { text: "ha", marks: [InlineMark.BOLD] },
              { text: "ha", marks: [InlineMark.BOLD] },
            ],
          },
        ]}
      />,
    );

    expect(getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Rep", "Rep"]);
    expect(
      getByText((_, element) => element?.tagName === "P" && element.textContent === "haha"),
    ).toBeInTheDocument();
  });

  it("garde le bon bloc quand le premier de deux est retiré", () => {
    const { rerender, getAllByRole, queryByText } = render(
      <CmvRichDocument
        blocks={[
          { type: RichBlockType.HEADING, content: [{ text: "Échauffement" }] },
          paragraph("Respirer."),
          paragraph("Respirer."),
        ]}
      />,
    );

    rerender(<CmvRichDocument blocks={[paragraph("Respirer."), paragraph("Respirer.")]} />);

    expect(queryByText("Échauffement")).toBeNull();
    expect(getAllByRole("paragraph")).toHaveLength(2);
  });
});

describe("CmvRichDocument — les images", () => {
  const image = (over: Partial<Extract<RichBlock, { type: "IMAGE" }>> = {}): RichBlock => ({
    type: RichBlockType.IMAGE,
    mediaId: "m-1",
    ...over,
  });

  it("ne rend rien sans résolveur, le texte reste lisible", () => {
    const { container, getByText } = render(
      <CmvRichDocument blocks={[image(), paragraph("Suite.")]} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(getByText("Suite.")).toBeInTheDocument();
  });

  it("ne rend rien pour un média qui ne se résout plus, sans cadre cassé", () => {
    const resolveImage = vi.fn(() => null);
    const { container } = render(
      <CmvRichDocument blocks={[image()]} resolveImage={resolveImage} />,
    );

    expect(resolveImage).toHaveBeenCalledWith("m-1");
    expect(container.querySelector("figure")).toBeNull();
  });

  it("rend l'image résolue, légendée, à la largeur choisie", () => {
    const { getByRole, getByText } = render(
      <CmvRichDocument
        blocks={[image({ caption: "Prise en pince", width: "SMALL" })]}
        resolveImage={() => "https://s3.test/m-1"}
      />,
    );

    const img = getByRole("img", { name: "Prise en pince" });
    expect(img).toHaveAttribute("src", "https://s3.test/m-1");
    expect(img).toHaveClass(IMAGE_WIDTH_CLASSES.SMALL);
    expect(getByText("Prise en pince").tagName).toBe("FIGCAPTION");
  });

  it("prend toute la largeur et se tait sans légende", () => {
    const { container } = render(
      <CmvRichDocument
        blocks={[image({ caption: null })]}
        resolveImage={() => "https://s3.test/m-1"}
      />,
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveClass(IMAGE_WIDTH_CLASSES.FULL);
    expect(container.querySelector("figcaption")).toBeNull();
  });
});
