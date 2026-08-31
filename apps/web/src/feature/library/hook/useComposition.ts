import type { ExerciseDto } from "@cmv/shared";
import { useState } from "react";

/**
 * Ce qu'une liste de composition manipule réellement : un identifiant local, de quoi s'afficher,
 * et la note qu'on y écrit. `key` est locale et stable — un même exercice peut figurer
 * deux fois dans une séance, l'id de l'exercice ne suffit donc pas à identifier la ligne.
 *
 * Le RESTE de la ligne appartient à chaque feature, et ce n'est pas un détail :
 *  - bibliothèque → `exerciseId` NON NULL : la séance modèle RÉFÉRENCE l'exercice ;
 *  - planification → `sourceExerciseId` nullable + snapshot : la séance planifiée en est une COPIE.
 * C'est ce qui permet au coach de supprimer un exercice sans casser un cycle diffusé (tranché en
 * P3). Ce socle générique ne connaît donc que la partie commune, jamais l'identité de l'exercice.
 */
export type CompositionRow = {
  key: string;
  title: string;
  tags: string[];
  note: string;
};

/**
 * La liste d'exercices en cours d'édition et les quatre gestes qui la modifient — partagés par le
 * builder de séance (bibliothèque) et le panneau de séance planifiée.
 *
 * `toRow` est le seul point d'extension : il construit la ligne propre à la feature à partir d'un
 * exercice, sans sa `key` — l'identité est la responsabilité du hook, pas de l'appelant.
 */
export function useComposition<T extends CompositionRow>(
  initialItems: () => T[],
  toRow: (exercise: ExerciseDto) => Omit<T, "key">,
) {
  const [items, setItems] = useState<T[]>(initialItems);

  function addExercise(exercise: ExerciseDto) {
    // TS ne peut pas prouver que `Omit<T, "key"> & { key: string }` reconstitue T — d'où le cast,
    // vrai par construction puisque `key` est le seul champ retiré.
    const row = { ...toRow(exercise), key: crypto.randomUUID() } as T;
    setItems((current) => [...current, row]);
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  // Déplace une ligne d'un cran ; la position finale = l'ordre du tableau (l'API la déduit).
  function moveItem(index: number, direction: -1 | 1) {
    setItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved == null) return current;
      next.splice(target, 0, moved);
      return next;
    });
  }

  function setNote(key: string, value: string) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, note: value } : item)),
    );
  }

  return { items, addExercise, removeItem, moveItem, setNote };
}
