import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * Le glisser tel que `useReorderDrag` le reçoit : départ sur la poignée de l'élément saisi, survol
 * puis dépôt sur un enfant de l'élément visé — le pointeur survole toujours un enfant, jamais la
 * ligne nue.
 */
export function dragOnto(source: HTMLElement, target: HTMLElement) {
  fireEvent.dragStart(source);
  fireEvent.dragOver(target);
  fireEvent.drop(target);
  fireEvent.dragEnd(source);
}

/**
 * Ce qu'un éditeur doit exposer pour être éprouvé par `describeReorder`. Les rangs sont 1-indexés,
 * comme ce que lit le coach.
 */
export type ReorderHarness = {
  /** Les libellés des éléments, dans l'ordre AFFICHÉ. */
  order: () => (string | null)[];
  moveUp: (rank: number) => Promise<void> | void;
  moveDown: (rank: number) => Promise<void> | void;
  /** Absent pour un éditeur sans glisser : les cas de glisser ne sont alors pas enregistrés. */
  drag?: (fromRank: number, toRank: number) => void;
  /** Nombre d'écritures remontées au parent ; absent quand l'état vit dans un hook. */
  writes?: () => number;
};

/**
 * La même suite de gestes, appliquée aux SEPT éditeurs de la bibliothèque qui recopient chacun le
 * déplacement d'élément (#360). Une seule définition du comportement attendu : quand #360 fusionnera
 * les copies, c'est elle qui dira qu'aucune n'a changé de sens. Les gestes passent par ce que le
 * coach touche — flèche, poignée au clavier, glisser —, jamais par la fonction interne.
 *
 * `mount` monte l'éditeur sur trois éléments, dont `labels` donne l'ordre initial — de façon
 * asynchrone pour un écran monté dans un routeur. `withDrag: false` pour un éditeur qui ne se
 * réordonne qu'aux flèches.
 */
export function describeReorder(
  labels: readonly [string, string, string],
  mount: () => ReorderHarness | Promise<ReorderHarness>,
  { withDrag = true }: { withDrag?: boolean } = {},
) {
  const [first, second, third] = labels;

  describe("déplacement par le geste", () => {
    it("descend un élément d'un cran", async () => {
      const editor = await mount();

      await editor.moveDown(1);

      expect(editor.order()).toEqual([second, first, third]);
    });

    it("monte un élément d'un cran", async () => {
      const editor = await mount();

      await editor.moveUp(3);

      expect(editor.order()).toEqual([first, third, second]);
    });

    it("ne monte pas le premier élément, et n'écrit rien", async () => {
      const editor = await mount();

      await editor.moveUp(1);

      expect(editor.order()).toEqual([first, second, third]);
      if (editor.writes) expect(editor.writes()).toBe(0);
    });

    it("ne descend pas le dernier élément, et n'écrit rien", async () => {
      const editor = await mount();

      await editor.moveDown(3);

      expect(editor.order()).toEqual([first, second, third]);
      if (editor.writes) expect(editor.writes()).toBe(0);
    });

    if (!withDrag) return;

    /** Le glisser de l'éditeur ; son absence est une erreur de montage, pas un cas sauté. */
    async function mountDraggable() {
      const editor = await mount();
      const { drag } = editor;
      if (drag == null) throw new Error("describeReorder : `drag` manque au harnais");
      return { ...editor, drag };
    }

    it("dépose l'élément glissé à la place de l'élément survolé, vers le bas", async () => {
      const editor = await mountDraggable();

      editor.drag(1, 3);

      expect(editor.order()).toEqual([second, third, first]);
    });

    it("dépose l'élément glissé à la place de l'élément survolé, vers le haut", async () => {
      const editor = await mountDraggable();

      editor.drag(3, 1);

      expect(editor.order()).toEqual([third, first, second]);
    });

    // Déposer sur soi-même n'est pas un déplacement : l'écrire ferait enregistrer une
    // modification là où le coach n'a rien changé.
    it("ne déplace rien quand l'élément est déposé sur lui-même", async () => {
      const editor = await mountDraggable();

      editor.drag(2, 2);

      expect(editor.order()).toEqual([first, second, third]);
      if (editor.writes) expect(editor.writes()).toBe(0);
    });
  });
}
