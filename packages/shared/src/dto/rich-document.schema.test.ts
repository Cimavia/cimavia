import { describe, expect, it } from "vitest";
import {
  InlineMark,
  RICH_DOCUMENT_MAX_TEXT_LENGTH,
  RichBlockType,
  richDocumentFromPlainText,
  richDocumentSchema,
  richDocumentTextLength,
  richDocumentToPlainText,
} from "./rich-document.schema";

const paragraph = (text: string) => ({
  type: RichBlockType.PARAGRAPH,
  content: [{ text }],
});

describe("richDocumentSchema", () => {
  it("accepte une consigne complète — titre, texte marqué, liste, encadré, image", () => {
    const result = richDocumentSchema.safeParse([
      { type: RichBlockType.HEADING, content: [{ text: "Mise en place" }] },
      {
        type: RichBlockType.PARAGRAPH,
        content: [
          { text: "Descente contrôlée jusqu'à " },
          { text: "extension complète", marks: [InlineMark.BOLD] },
        ],
      },
      {
        type: RichBlockType.LIST,
        ordered: false,
        items: [[{ text: "Prise en pronation" }], [{ text: "Suspension complète" }]],
      },
      { type: RichBlockType.CALLOUT, content: [{ text: "Pas de balancement du buste." }] },
      { type: RichBlockType.IMAGE, mediaId: "med_1", caption: "Position basse" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepte un document vide — un exercice sans consigne est légitime", () => {
    expect(richDocumentSchema.parse([])).toEqual([]);
  });

  it("accepte un lien porteur d'une marque", () => {
    const result = richDocumentSchema.safeParse([
      {
        type: RichBlockType.PARAGRAPH,
        content: [
          { text: "la démo", href: "https://example.com/demo", marks: [InlineMark.ITALIC] },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("refuse un type de bloc inconnu", () => {
    const result = richDocumentSchema.safeParse([{ type: "TABLE", content: [{ text: "x" }] }]);
    expect(result.success).toBe(false);
  });

  it("refuse un champ inconnu dans un bloc (schéma strict)", () => {
    const result = richDocumentSchema.safeParse([
      { type: RichBlockType.PARAGRAPH, content: [{ text: "x" }], color: "red" },
    ]);
    expect(result.success).toBe(false);
  });

  it("refuse un bloc de texte sans contenu", () => {
    const result = richDocumentSchema.safeParse([{ type: RichBlockType.PARAGRAPH, content: [] }]);
    expect(result.success).toBe(false);
  });

  it("refuse une image désignée par URL plutôt que par référence", () => {
    const result = richDocumentSchema.safeParse([
      { type: RichBlockType.IMAGE, url: "https://bucket.s3/photo.jpg" },
    ]);
    expect(result.success).toBe(false);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>",
    "pas-une-url",
  ])("refuse un href non http(s) — %s", (href) => {
    const result = richDocumentSchema.safeParse([
      { type: RichBlockType.PARAGRAPH, content: [{ text: "x", href }] },
    ]);
    expect(result.success).toBe(false);
  });

  it("refuse un document dont le texte cumulé dépasse le plafond", () => {
    const blocks = Array.from({ length: 6 }, () => paragraph("a".repeat(1000)));
    expect(richDocumentTextLength(blocks)).toBeGreaterThan(RICH_DOCUMENT_MAX_TEXT_LENGTH);
    expect(richDocumentSchema.safeParse(blocks).success).toBe(false);
  });
});

describe("richDocumentTextLength", () => {
  it("compte le texte des listes et ignore les images", () => {
    const length = richDocumentTextLength([
      { type: RichBlockType.LIST, ordered: true, items: [[{ text: "abc" }], [{ text: "de" }]] },
      { type: RichBlockType.IMAGE, mediaId: "med_1", caption: "légende ignorée" },
    ]);
    expect(length).toBe(5);
  });
});

describe("richDocumentToPlainText", () => {
  it("concatène les blocs ligne à ligne et ne garde d'une image que sa légende", () => {
    const text = richDocumentToPlainText([
      { type: RichBlockType.HEADING, content: [{ text: "Exécution" }] },
      {
        type: RichBlockType.PARAGRAPH,
        content: [{ text: "Amplitude " }, { text: "complète", marks: [InlineMark.BOLD] }],
      },
      { type: RichBlockType.LIST, ordered: false, items: [[{ text: "Gainage actif" }]] },
      { type: RichBlockType.IMAGE, mediaId: "med_1", caption: "Position basse" },
      { type: RichBlockType.IMAGE, mediaId: "med_2" },
    ]);
    expect(text).toBe("Exécution\nAmplitude complète\nGainage actif\nPosition basse");
  });
});

describe("richDocumentFromPlainText", () => {
  it("engendre un unique paragraphe — la migration ne tente aucun parsing", () => {
    expect(richDocumentFromPlainText("Faire 4 séries de 6")).toEqual([
      { type: RichBlockType.PARAGRAPH, content: [{ text: "Faire 4 séries de 6" }] },
    ]);
  });

  it("rend null sur un texte absent ou blanc — jamais un paragraphe vide", () => {
    expect(richDocumentFromPlainText(null)).toBeNull();
    expect(richDocumentFromPlainText("   ")).toBeNull();
  });

  it("produit un document que le schéma accepte, et qui revient au texte d'origine", () => {
    const document = richDocumentFromPlainText("Descente contrôlée");
    expect(richDocumentSchema.safeParse(document).success).toBe(true);
    expect(richDocumentToPlainText(document ?? [])).toBe("Descente contrôlée");
  });
});
