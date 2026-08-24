import {
  type InlineMark,
  type InlineNode,
  type RichBlock,
  RichBlockType,
  type RichDocument,
} from "@cmv/shared";
import type { JSONContent } from "@tiptap/react";

/**
 * Traduction entre le document de TipTap et `RichDocument` (@cmv/shared).
 *
 * Pourquoi une traduction et pas le JSON de TipTap tel quel en base : ce JSON est le format d'un
 * ÉDITEUR web. Le stocker ferait dépendre le rendu React Native et le contrat d'API d'une
 * bibliothèque que ni l'un ni l'autre n'embarquent, et d'une version qu'on ne contrôle pas. Le
 * modèle stocké reste le nôtre, validé par Zod ; TipTap n'est qu'une surface de saisie.
 *
 * Sens de la tolérance : à la LECTURE de TipTap on jette ce qu'on ne connaît pas (un collage peut
 * apporter n'importe quel nœud), à l'ÉCRITURE vers TipTap on est exhaustif — la source est déjà
 * validée par `richDocumentSchema`.
 */

/** Nom du nœud d'encadré. TipTap n'en fournit pas : il est défini dans `calloutExtension`. */
export const CALLOUT_NODE = "callout";

/** Nom du nœud image. Porte un `mediaId`, jamais une URL : les URLs S3 sont signées et expirent. */
export const IMAGE_NODE = "instructionImage";

/** Un seul niveau de titre : une consigne d'exercice ne se hiérarchise pas davantage. */
export const HEADING_LEVEL = 3;

const MARK_BY_TIPTAP_NAME: Record<string, InlineMark> = {
  bold: "BOLD",
  italic: "ITALIC",
  underline: "UNDERLINE",
};

const TIPTAP_NAME_BY_MARK: Record<InlineMark, string> = {
  BOLD: "bold",
  ITALIC: "italic",
  UNDERLINE: "underline",
};

// ── TipTap → RichDocument ───────────────────────────────────────────────────────────────────

function toInlineNode(node: JSONContent): InlineNode | null {
  // Un fragment sans texte n'a rien à porter : `inlineNodeSchema` exige `text` non vide.
  if (node.type !== "text" || !node.text) return null;

  const marks: InlineMark[] = [];
  let href: string | undefined;
  for (const mark of node.marks ?? []) {
    const known = MARK_BY_TIPTAP_NAME[mark.type];
    if (known != null) marks.push(known);
    if (mark.type === "link" && typeof mark.attrs?.href === "string") href = mark.attrs.href;
  }

  return {
    text: node.text,
    ...(marks.length > 0 ? { marks } : {}),
    ...(href != null ? { href } : {}),
  };
}

function toInlineContent(nodes: JSONContent[] | undefined): InlineNode[] {
  return (nodes ?? []).map(toInlineNode).filter((node): node is InlineNode => node != null);
}

/** Une puce de TipTap contient un paragraphe ; notre modèle ne garde que son contenu inline. */
function toListItem(item: JSONContent): InlineNode[] {
  return (item.content ?? []).flatMap((child) => toInlineContent(child.content));
}

function readInlineBlock(
  type:
    | typeof RichBlockType.HEADING
    | typeof RichBlockType.PARAGRAPH
    | typeof RichBlockType.CALLOUT,
) {
  return (node: JSONContent): RichBlock | null => {
    const content = toInlineContent(node.content);
    // Un bloc sans texte est la respiration normale d'un éditeur, pas de la donnée à stocker.
    return content.length === 0 ? null : { type, content };
  };
}

function readList(ordered: boolean) {
  return (node: JSONContent): RichBlock | null => {
    const items = (node.content ?? []).map(toListItem).filter((item) => item.length > 0);
    return items.length === 0 ? null : { type: RichBlockType.LIST, ordered, items };
  };
}

function readImage(node: JSONContent): RichBlock | null {
  const mediaId = node.attrs?.mediaId;
  // Un nœud image sans média est un nœud à moitié posé (fichier non choisi, ou envoi échoué) :
  // il n'a rien à stocker.
  if (typeof mediaId !== "string" || mediaId === "") return null;
  const caption = typeof node.attrs?.caption === "string" ? node.attrs.caption.trim() : "";
  return { type: RichBlockType.IMAGE, mediaId, ...(caption === "" ? {} : { caption }) };
}

/**
 * Un lecteur par type de nœud. Une table plutôt qu'une chaîne de `if` : chaque entrée reste
 * lisible seule, et ajouter un type ne rend pas la fonction d'aiguillage plus complexe.
 *
 * Ce que la table ne connaît pas est jeté — un collage peut apporter n'importe quel nœud.
 */
const BLOCK_READERS: Record<string, (node: JSONContent) => RichBlock | null> = {
  heading: readInlineBlock(RichBlockType.HEADING),
  paragraph: readInlineBlock(RichBlockType.PARAGRAPH),
  [CALLOUT_NODE]: readInlineBlock(RichBlockType.CALLOUT),
  [IMAGE_NODE]: readImage,
  bulletList: readList(false),
  orderedList: readList(true),
};

function toRichBlock(node: JSONContent): RichBlock | null {
  const read = node.type == null ? undefined : BLOCK_READERS[node.type];
  return read?.(node) ?? null;
}

/**
 * Le document saisi, réduit à ce que le modèle connaît. Rend un tableau éventuellement VIDE —
 * c'est à l'appelant de décider qu'un document vide vaut `null` (règle nullable n°5).
 */
export function toRichDocument(doc: JSONContent | null | undefined): RichDocument {
  return (doc?.content ?? []).map(toRichBlock).filter((block): block is RichBlock => block != null);
}

// ── RichDocument → TipTap ───────────────────────────────────────────────────────────────────

function toTipTapText(node: InlineNode): JSONContent {
  // Typé depuis `JSONContent` et non inféré : sans ça le tableau naît en `{ type: string }[]` et
  // refuse la marque de lien, qui seule porte des `attrs`.
  const marks: NonNullable<JSONContent["marks"]> = (node.marks ?? []).map((mark) => ({
    type: TIPTAP_NAME_BY_MARK[mark],
  }));
  if (node.href != null) marks.push({ type: "link", attrs: { href: node.href } });
  return { type: "text", text: node.text, ...(marks.length > 0 ? { marks } : {}) };
}

function toTipTapNode(block: RichBlock): JSONContent | null {
  if (block.type === RichBlockType.HEADING) {
    return {
      type: "heading",
      attrs: { level: HEADING_LEVEL },
      content: block.content.map(toTipTapText),
    };
  }
  if (block.type === RichBlockType.PARAGRAPH) {
    return { type: "paragraph", content: block.content.map(toTipTapText) };
  }
  if (block.type === RichBlockType.CALLOUT) {
    return { type: CALLOUT_NODE, content: block.content.map(toTipTapText) };
  }
  if (block.type === RichBlockType.LIST) {
    return {
      type: block.ordered ? "orderedList" : "bulletList",
      content: block.items.map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: item.map(toTipTapText) }],
      })),
    };
  }
  if (block.type === RichBlockType.IMAGE) {
    return {
      type: IMAGE_NODE,
      attrs: { mediaId: block.mediaId, caption: block.caption ?? "" },
    };
  }
  return null;
}

export function toTipTapDocument(blocks: RichDocument | null | undefined): JSONContent {
  const content = (blocks ?? [])
    .map(toTipTapNode)
    .filter((node): node is JSONContent => node != null);
  // TipTap refuse un document sans contenu : un paragraphe vide est son état de repos.
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}
