import { richDocumentSchema } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import {
  CALLOUT_NODE,
  HEADING_LEVEL,
  IMAGE_NODE,
  toRichDocument,
  toTipTapDocument,
} from "./tiptap-document.util";

const doc = (...content: unknown[]) => ({ type: "doc", content }) as never;
const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, marks });

describe("toRichDocument", () => {
  it("traduit les quatre types de blocs", () => {
    const blocks = toRichDocument(
      doc(
        { type: "heading", attrs: { level: 3 }, content: [text("Mise en place")] },
        { type: "paragraph", content: [text("Coudes serrés.")] },
        { type: CALLOUT_NODE, content: [text("Ne pas creuser le dos.")] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("Épaules basses")] }],
            },
          ],
        },
      ),
    );
    expect(blocks.map((block) => block.type)).toEqual(["HEADING", "PARAGRAPH", "CALLOUT", "LIST"]);
    // Le résultat doit passer le schéma partagé : c'est lui qui décide, pas ce fichier.
    expect(richDocumentSchema.safeParse(blocks).success).toBe(true);
  });

  it("distingue liste à puces et liste numérotée", () => {
    const item = {
      type: "listItem",
      content: [{ type: "paragraph", content: [text("un")] }],
    };
    const [bullet] = toRichDocument(doc({ type: "bulletList", content: [item] }));
    const [ordered] = toRichDocument(doc({ type: "orderedList", content: [item] }));
    expect(bullet).toMatchObject({ ordered: false });
    expect(ordered).toMatchObject({ ordered: true });
  });

  it("garde les marques connues et le lien, jette les autres", () => {
    const [block] = toRichDocument(
      doc({
        type: "paragraph",
        content: [
          text("gras", [{ type: "bold" }, { type: "strike" }]),
          text("ici", [{ type: "link", attrs: { href: "https://cimavia.fr" } }]),
        ],
      }),
    );
    // `strike` existe dans StarterKit mais pas dans notre modèle : il disparaît sans faire échouer
    // la conversion — un collage peut apporter n'importe quelle marque.
    expect(block).toMatchObject({
      content: [
        { text: "gras", marks: ["BOLD"] },
        { text: "ici", href: "https://cimavia.fr" },
      ],
    });
  });

  it("jette un nœud que le modèle ne connaît pas", () => {
    expect(toRichDocument(doc({ type: "codeBlock", content: [text("npm i")] }))).toEqual([]);
  });

  it("ne stocke pas les blocs vides — c'est la respiration d'un éditeur, pas de la donnée", () => {
    expect(toRichDocument(doc({ type: "paragraph" }, { type: "heading", content: [] }))).toEqual(
      [],
    );
    expect(toRichDocument(doc())).toEqual([]);
    expect(toRichDocument(null)).toEqual([]);
  });

  it("ignore un fragment de texte vide", () => {
    const [block] = toRichDocument(doc({ type: "paragraph", content: [text(""), text("Reste.")] }));
    expect(block).toMatchObject({ content: [{ text: "Reste." }] });
  });
});

describe("toTipTapDocument", () => {
  it("fait l'aller-retour sans perte", () => {
    const source = toRichDocument(
      doc(
        { type: "heading", attrs: { level: HEADING_LEVEL }, content: [text("Exécution")] },
        {
          type: "paragraph",
          content: [
            text("Coudes ", [{ type: "bold" }]),
            text("serrés", [{ type: "italic" }, { type: "underline" }]),
          ],
        },
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [text("Tirer")] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [text("Descendre")] }] },
          ],
        },
        { type: CALLOUT_NODE, content: [text("Attention au dos.")] },
      ),
    );
    expect(toRichDocument(toTipTapDocument(source))).toEqual(source);
  });

  it("rend un paragraphe vide sur un document nul — TipTap refuse un document sans contenu", () => {
    expect(toTipTapDocument(null)).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(toTipTapDocument([])).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("réécrit le lien en marque TipTap", () => {
    const tiptap = toTipTapDocument([
      { type: "PARAGRAPH", content: [{ text: "ici", href: "https://cimavia.fr" }] },
    ]);
    expect(tiptap.content?.[0]?.content?.[0]?.marks).toEqual([
      { type: "link", attrs: { href: "https://cimavia.fr" } },
    ]);
  });
});

describe("largeur d'image", () => {
  const imageNode = (width?: string) =>
    doc({
      type: IMAGE_NODE,
      attrs: { mediaId: "doc_1", caption: "", ...(width ? { width } : {}) },
    });

  it("ne stocke PAS la pleine largeur — l'absence la vaut déjà", () => {
    // Écrire la valeur par défaut ferait diverger les images posées avant l'arrivée du réglage.
    expect(toRichDocument(imageNode("FULL"))).toEqual([{ type: "IMAGE", mediaId: "doc_1" }]);
    expect(toRichDocument(imageNode())).toEqual([{ type: "IMAGE", mediaId: "doc_1" }]);
  });

  it("stocke les deux autres paliers", () => {
    expect(toRichDocument(imageNode("SMALL"))).toEqual([
      { type: "IMAGE", mediaId: "doc_1", width: "SMALL" },
    ]);
  });

  it("retombe sur la pleine largeur devant une valeur inconnue", () => {
    expect(toRichDocument(imageNode("GIGANTESQUE"))).toEqual([{ type: "IMAGE", mediaId: "doc_1" }]);
  });

  it("fait l'aller-retour", () => {
    const source = toRichDocument(imageNode("MEDIUM"));
    expect(toRichDocument(toTipTapDocument(source))).toEqual(source);
  });
});
