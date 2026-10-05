import type { ExerciseDto } from "@cmv/shared";
import { useState } from "react";

/**
 * Ce qu'une liste de composition manipule réellement : un identifiant local, de quoi s'afficher,
 * et la note qu'on y écrit. `key` est locale et stable — un même exercice peut figurer
 * deux fois dans une séance, l'id de l'exercice ne suffit donc pas à identifier la ligne.
 *
 * Le RESTE de la ligne — `sourceExerciseId` nullable, snapshot — appartient à la séance planifiée
 * (`useSessionComposition`) : elle est une COPIE de l'exercice, pas une référence, et c'est ce qui
 * permet au coach de supprimer un exercice sans casser un cycle diffusé (tranché en P3).
 */
export type CompositionRow = {
  key: string;
  title: string;
  tags: string[];
  note: string;
};

/**
 * La liste d'exercices en cours d'édition et les quatre gestes qui la modifient, pour le panneau de
 * séance planifiée. Le constructeur de séance de la bibliothèque a les siens (`useSessionDraft`).
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

  /**
   * Déplace une ligne À un index — la forme qu'attend le glisser-déposer, qui connaît son point de
   * départ et son point d'arrivée, jamais la distance entre les deux.
   *
   * La position finale = l'ordre du tableau (l'API la déduit) : rien à renuméroter ici.
   */
  function moveTo(from: number, to: number) {
    setItems((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  }

  // Déplace une ligne d'un cran — la forme qu'attendent les flèches et le clavier.
  function moveItem(index: number, direction: -1 | 1) {
    moveTo(index, index + direction);
  }

  function setNote(key: string, value: string) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, note: value } : item)),
    );
  }

  return { items, addExercise, removeItem, moveItem, moveTo, setNote };
}
