import { type InlineNode, type RichBlock, RichBlockType, type RichDocument } from "@cmv/shared";
import type { ReactNode } from "react";
import { cn } from "@/shared/util/cn.util";

/**
 * Rendu NATIF d'une consigne structurée — pas de HTML injecté, pas de `dangerouslySetInnerHTML`.
 *
 * Ce n'est pas une précaution de principe : le document est écrit par un coach et lu par ses
 * athlètes. Passer par du HTML rendrait chaque consigne un vecteur potentiel, et obligerait à
 * assainir à chaque affichage. Ici le modèle N'A PAS de forme HTML — il n'y a rien à assainir.
 *
 * Le pendant React Native rend exactement les mêmes blocs avec ses propres primitives (#166).
 */

const MARK_CLASSES = {
  BOLD: "font-semibold",
  ITALIC: "italic",
  UNDERLINE: "underline",
} as const;

function InlineText({ node }: Readonly<{ node: InlineNode }>) {
  const className = cn(...(node.marks ?? []).map((mark) => MARK_CLASSES[mark]));
  const content = className === "" ? node.text : <span className={className}>{node.text}</span>;

  if (node.href == null) return content;
  return (
    <a
      href={node.href}
      target="_blank"
      rel="noreferrer"
      className={cn("text-cmv-accent underline", className)}
    >
      {node.text}
    </a>
  );
}

function inlineContent(nodes: readonly InlineNode[]): ReactNode {
  // L'index sert de clé : deux fragments peuvent porter le même texte, et leur ORDRE est leur
  // seule identité — ils ne sont ni réordonnés ni filtrés après rendu.
  return nodes.map((node, index) => <InlineText key={index} node={node} />);
}

/**
 * Résout l'id d'un média vers une URL affichable. Le document ne stocke QUE l'id (règle dure
 * n°7) : les URLs S3 sont signées et expirent, une consigne relue trois mois plus tard afficherait
 * des images mortes si on les y gravait.
 *
 * Rend `null` quand l'id ne correspond à rien — un média supprimé ne casse pas la lecture.
 */
export type ResolveImage = (mediaId: string) => string | null;

function ListBlock({ block }: Readonly<{ block: Extract<RichBlock, { type: "LIST" }> }>) {
  const List = block.ordered ? "ol" : "ul";
  return (
    <List
      className={cn(
        "flex flex-col gap-cmv-xs pl-cmv-lg text-cmv-body text-cmv-text-mid",
        block.ordered ? "list-decimal" : "list-disc",
      )}
    >
      {block.items.map((item, index) => (
        <li key={index}>{inlineContent(item)}</li>
      ))}
    </List>
  );
}

function ImageBlock({
  block,
  resolveImage,
}: Readonly<{
  block: Extract<RichBlock, { type: "IMAGE" }>;
  resolveImage: ResolveImage | undefined;
}>) {
  const src = resolveImage?.(block.mediaId) ?? null;
  // Sans résolveur ou sans média correspondant : rien. Pas de cadre cassé, pas de « image
  // indisponible » — la consigne se lit sans elle.
  if (src == null) return null;

  const caption = block.caption ?? "";
  return (
    <figure className="flex flex-col gap-cmv-xs">
      {/* Pleine largeur du bloc, jamais habillée de texte : le modèle n'a pas de flottant. */}
      <img src={src} alt={caption} className="w-full rounded-cmv-md" />
      {caption === "" ? null : (
        <figcaption className="text-cmv-caption text-cmv-text-mid">{caption}</figcaption>
      )}
    </figure>
  );
}

function Block({
  block,
  resolveImage,
}: Readonly<{ block: RichBlock; resolveImage: ResolveImage | undefined }>) {
  if (block.type === RichBlockType.HEADING) {
    return <h4 className="text-cmv-subtitle text-cmv-text-hi">{inlineContent(block.content)}</h4>;
  }
  if (block.type === RichBlockType.PARAGRAPH) {
    return <p className="text-cmv-body text-cmv-text-mid">{inlineContent(block.content)}</p>;
  }
  if (block.type === RichBlockType.CALLOUT) {
    return (
      <aside className="rounded-l-cmv-sm border-cmv-accent border-l-2 bg-cmv-accent-soft/30 py-cmv-xs pl-cmv-md text-cmv-body text-cmv-text-mid">
        {inlineContent(block.content)}
      </aside>
    );
  }
  if (block.type === RichBlockType.LIST) return <ListBlock block={block} />;
  return <ImageBlock block={block} resolveImage={resolveImage} />;
}

type CmvRichDocumentProps = {
  blocks: RichDocument | null;
  /** Absent = les images ne sont pas rendues. Le texte, lui, reste lisible. */
  resolveImage?: ResolveImage;
};

export function CmvRichDocument({ blocks, resolveImage }: Readonly<CmvRichDocumentProps>) {
  // Une consigne absente n'affiche RIEN — pas de « aucune consigne », qui serait du bruit sur une
  // absence légitime (règle nullable n°5).
  if (blocks == null || blocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-cmv-sm">
      {blocks.map((block, index) => (
        <Block key={index} block={block} resolveImage={resolveImage} />
      ))}
    </div>
  );
}
