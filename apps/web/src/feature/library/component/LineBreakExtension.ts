import { Extension } from "@tiptap/core";

/**
 * Maj+Entrée vaut Entrée dans la consigne (#328).
 *
 * Le saut de ligne de StarterKit (`hardBreak`) est coupé : le modèle stocké n'en porte pas, et la
 * conversion collait les deux lignes. Le coach qui va à la ligne obtient donc ce que le modèle sait
 * garder — un nouveau paragraphe, ou un nouvel élément dans une liste — plutôt qu'une touche
 * inerte : ProseMirror retient Entrée, rien ne se passerait.
 *
 * `enter()` rejoue Entrée au lieu d'en recopier la chaîne de commandes : coupure d'élément de
 * liste, sortie d'un élément vide, tout suit.
 */
export const LineBreakExtension = Extension.create({
  name: "lineBreakAsEnter",

  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => this.editor.commands.enter(),
    };
  },
});
