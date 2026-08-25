import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

// Document de consigne d'un exercice — remplace `Exercise.description: String` (refonte #162).
//
// Deux invariants portent tout le reste :
//   1. Le document est du JSON de blocs TYPÉS, jamais du HTML. Il est rendu nativement côté web
//      ET côté React Native — aucune WebView, aucun `dangerouslySetInnerHTML`.
//   2. Une image est désignée par RÉFÉRENCE (`mediaId`), jamais par URL : les URLs S3 sont
//      signées et expirent (règle dure n°7). La résolution se fait à l'affichage.
//
// Les blocs ne s'imbriquent pas : un encadré contient du texte, pas d'autres blocs. C'est
// délibéré — ça garde le rendu trivial sur les deux plateformes et l'éditeur prévisible.

export const RICH_DOCUMENT_MAX_BLOCKS = 200;
// Plafond du texte cumulé, marques et légendes exclues. Reprend l'ancien
// EXERCISE_DESCRIPTION_MAX_LENGTH : le passage au structuré ne doit pas permettre au coach
// d'écrire dix fois plus qu'avant.
export const RICH_DOCUMENT_MAX_TEXT_LENGTH = 5000;
export const RICH_TEXT_MAX_LENGTH = 2000;
export const RICH_IMAGE_CAPTION_MAX_LENGTH = 300;
export const RICH_LIST_MAX_ITEMS = 50;

// Marques de texte. Volontairement TROIS : la coloration de texte a été écartée pour que
// l'accent reste rare — le seul élément coloré du document est l'encadré.
export const InlineMark = {
  BOLD: "BOLD",
  ITALIC: "ITALIC",
  UNDERLINE: "UNDERLINE",
} as const;
export type InlineMark = TypesValuesOf<typeof InlineMark>;
export const inlineMarkSchema = z.enum(InlineMark);

// Seuls http(s) passent. `z.url()` ne valide que la SYNTAXE, et `javascript:alert(1)` est une
// URL syntaxiquement correcte : sans ce garde, un lien de consigne écrit par un coach devient un
// vecteur XSS dès le premier `<a href>` rendu côté web.
// Vérifié par motif plutôt qu'avec `new URL()` : ce package est compilé sans lib DOM ni types
// Node pour rester consommable tel quel par l'API, le web et React Native.
const LINK_PROTOCOL_PATTERN = /^https?:\/\//i;
export const linkHrefSchema = z
  .url()
  .regex(LINK_PROTOCOL_PATTERN, { message: "Un lien doit être en http ou https." });

// Fragment de texte homogène. Un lien est un fragment porteur de `href` : il peut donc être
// gras ou italique comme n'importe quel autre.
export const inlineNodeSchema = z
  .object({
    text: z.string().min(1).max(RICH_TEXT_MAX_LENGTH),
    marks: z.array(inlineMarkSchema).max(3).optional(),
    href: linkHrefSchema.optional(),
  })
  .strict();
export type InlineNode = z.infer<typeof inlineNodeSchema>;

const inlineContentSchema = z.array(inlineNodeSchema).min(1);

export const RichBlockType = {
  HEADING: "HEADING",
  PARAGRAPH: "PARAGRAPH",
  LIST: "LIST",
  CALLOUT: "CALLOUT",
  IMAGE: "IMAGE",
} as const;
export type RichBlockType = TypesValuesOf<typeof RichBlockType>;
export const richBlockTypeSchema = z.enum(RichBlockType);

// Titre de section — « Mise en place », « Exécution », « Erreurs fréquentes ». Un seul niveau :
// une consigne d'exercice ne se hiérarchise pas plus.
export const headingBlockSchema = z
  .object({ type: z.literal(RichBlockType.HEADING), content: inlineContentSchema })
  .strict();

export const paragraphBlockSchema = z
  .object({ type: z.literal(RichBlockType.PARAGRAPH), content: inlineContentSchema })
  .strict();

export const listBlockSchema = z
  .object({
    type: z.literal(RichBlockType.LIST),
    ordered: z.boolean(),
    items: z.array(inlineContentSchema).min(1).max(RICH_LIST_MAX_ITEMS),
  })
  .strict();

// L'encadré à barre accent. UN SEUL type, sans variante de couleur : trois encadrés colorés
// feraient revenir par la fenêtre la coloration de texte qu'on a écartée.
export const calloutBlockSchema = z
  .object({ type: z.literal(RichBlockType.CALLOUT), content: inlineContentSchema })
  .strict();

/**
 * Trois largeurs, pas une valeur libre : un pourcentage saisi à la main donnerait des images qui
 * dépendent de l'écran où elles ont été posées, et que le rendu React Native devrait interpréter
 * au pixel près. Trois paliers se rendent identiquement partout.
 */
export const ImageWidth = {
  SMALL: "SMALL",
  MEDIUM: "MEDIUM",
  FULL: "FULL",
} as const;
export type ImageWidth = TypesValuesOf<typeof ImageWidth>;
export const imageWidthSchema = z.enum(ImageWidth);

// `mediaId` référence un objet du stockage — jamais une URL signée (règle dure n°7).
export const imageBlockSchema = z
  .object({
    type: z.literal(RichBlockType.IMAGE),
    mediaId: z.string().min(1),
    caption: z.string().max(RICH_IMAGE_CAPTION_MAX_LENGTH).nullable().optional(),
    // Absente = pleine largeur : c'est ce que valent les images posées avant l'arrivée du réglage.
    width: imageWidthSchema.optional(),
  })
  .strict();

export const richBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  listBlockSchema,
  calloutBlockSchema,
  imageBlockSchema,
]);
export type RichBlock = z.infer<typeof richBlockSchema>;

/** Texte cumulé d'un document, marques et légendes exclues. */
export function richDocumentTextLength(blocks: readonly RichBlock[]): number {
  return blocks.reduce((total, block) => {
    if (block.type === RichBlockType.IMAGE) return total;
    if (block.type === RichBlockType.LIST) {
      return (
        total +
        block.items.reduce(
          (sum, item) => sum + item.reduce((acc, node) => acc + node.text.length, 0),
          0,
        )
      );
    }
    return total + block.content.reduce((acc, node) => acc + node.text.length, 0);
  }, 0);
}

export const richDocumentSchema = z
  .array(richBlockSchema)
  .max(RICH_DOCUMENT_MAX_BLOCKS)
  .refine((blocks) => richDocumentTextLength(blocks) <= RICH_DOCUMENT_MAX_TEXT_LENGTH, {
    message: `Le texte du document dépasse ${RICH_DOCUMENT_MAX_TEXT_LENGTH} caractères.`,
  });
export type RichDocument = z.infer<typeof richDocumentSchema>;

/**
 * Réécrit les identifiants de média d'un document.
 *
 * Sert à la DIFFUSION : les documents d'un exercice sont recopiés en nouvelles lignes, avec de
 * nouveaux identifiants, tandis que la consigne garde les anciens. Sans ce remappage les images de
 * consigne ne désignent plus rien chez l'athlète — et l'échec est SILENCIEUX, puisqu'un média
 * introuvable ne s'affiche simplement pas.
 *
 * Une image dont l'identifiant n'est pas dans la table est laissée telle quelle : la perdre ferait
 * disparaître un bloc que le coach a bel et bien écrit.
 */
export function remapImageMediaIds(
  blocks: readonly RichBlock[],
  idByOldId: ReadonlyMap<string, string>,
): RichDocument {
  return blocks.map((block) => {
    if (block.type !== RichBlockType.IMAGE) return block;
    const next = idByOldId.get(block.mediaId);
    return next == null ? block : { ...block, mediaId: next };
  });
}

/** Les identifiants de média cités par un document — ce qu'il faudra remapper. */
export function imageMediaIds(blocks: readonly RichBlock[]): string[] {
  return blocks.flatMap((block) => (block.type === RichBlockType.IMAGE ? [block.mediaId] : []));
}

/**
 * Rendu en texte brut — sert au `down` de la migration et aux aperçus d'une ligne.
 * Une image ne rend que sa légende : sans elle, elle ne laisse aucune trace.
 */
export function richDocumentToPlainText(blocks: readonly RichBlock[]): string {
  const lines = blocks.flatMap((block) => {
    if (block.type === RichBlockType.IMAGE) return block.caption ? [block.caption] : [];
    if (block.type === RichBlockType.LIST) {
      return block.items.map((item) => item.map((node) => node.text).join(""));
    }
    return [block.content.map((node) => node.text).join("")];
  });
  return lines.filter((line) => line.length > 0).join("\n");
}

/**
 * Document minimal engendré depuis un texte libre — utilisé par la migration de
 * `Exercise.description`. Un texte vide ou blanc ne produit AUCUN bloc : le document reste
 * `null`, jamais un paragraphe vide (règle dure n°5).
 */
export function richDocumentFromPlainText(text: string | null | undefined): RichDocument | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return [{ type: RichBlockType.PARAGRAPH, content: [{ text: trimmed }] }];
}
