import { createContext, type ReactNode, useContext } from "react";
import type { InstructionMedia } from "@/feature/library/hook/useInstructionMedia";

/**
 * Les vues de nœud de TipTap sont rendues par portail DANS l'arbre React d'`EditorContent` : le
 * contexte y circule normalement. C'est ce qui permet au nœud image d'afficher son aperçu local
 * et sa progression sans que l'extension ait à transporter l'état elle-même.
 */
const InstructionMediaContext = createContext<InstructionMedia | null>(null);

export function InstructionMediaProvider({
  media,
  children,
}: Readonly<{ media: InstructionMedia; children: ReactNode }>) {
  return (
    <InstructionMediaContext.Provider value={media}>{children}</InstructionMediaContext.Provider>
  );
}

export function useInstructionMediaContext(): InstructionMedia {
  const media = useContext(InstructionMediaContext);
  if (media == null) {
    throw new Error("[library] vue de nœud image rendue hors de InstructionMediaProvider");
  }
  return media;
}
