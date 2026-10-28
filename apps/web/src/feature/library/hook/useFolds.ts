import { useState } from "react";

/**
 * Ce que le Coach a replié dans la composition (#719) : un bloc par son identifiant, un exercice
 * par sa clé. Ce qui arrive est déplié — rien ne le nomme encore. Ce qui part laisse une entrée
 * qu'on ne lit plus : seuls les blocs et exercices présents se demandent (`isFolded`).
 */
export function useFolds() {
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  return {
    isFolded: (id: string) => folded.has(id),
    toggle: (id: string) =>
      setFolded((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    /** « Tout replier » replie les blocs : un bloc qu'on rouvre montre ses exercices tels qu'il les a laissés. */
    foldAll: (ids: readonly string[]) => setFolded((current) => new Set([...current, ...ids])),
    unfoldAll: () => setFolded(new Set()),
  };
}

export type Folds = ReturnType<typeof useFolds>;
