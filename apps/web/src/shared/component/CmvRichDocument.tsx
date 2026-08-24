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

function Block({ block }: Readonly<{ block: RichBlock }>) {
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
  if (block.type === RichBlockType.LIST) {
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
  // IMAGE : rendue au commit suivant, avec la résolution d'URL signée qu'elle demande.
  return null;
}

type CmvRichDocumentProps = {
  blocks: RichDocument | null;
};

export function CmvRichDocument({ blocks }: Readonly<CmvRichDocumentProps>) {
  // Une consigne absente n'affiche RIEN — pas de « aucune consigne », qui serait du bruit sur une
  // absence légitime (règle nullable n°5).
  if (blocks == null || blocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-cmv-sm">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
