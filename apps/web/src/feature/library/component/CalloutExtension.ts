import { mergeAttributes, Node } from "@tiptap/core";
import { CALLOUT_NODE } from "@/feature/library/util/tiptap-document.util";

/**
 * L'encadré à barre accent. TipTap n'en fournit pas — `blockquote` existe mais porte une autre
 * intention, et le réutiliser rendrait la citation et l'encadré indistinguables à la conversion.
 *
 * UN SEUL type, sans variante de couleur : trois encadrés colorés feraient revenir par la fenêtre
 * la coloration de texte qu'on a écartée du modèle.
 *
 * `content: "inline*"` et non `"block+"` : le modèle stocké (`calloutBlockSchema`) porte du
 * contenu inline, pas des blocs imbriqués. Autoriser l'imbrication ici produirait des documents
 * que la conversion aplatirait en silence.
 */
export const CalloutExtension = Node.create({
  name: CALLOUT_NODE,
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-callout": "",
        class:
          "rounded-l-cmv-sm border-cmv-accent border-l-2 bg-cmv-accent-soft/30 py-cmv-xs pl-cmv-md text-cmv-text-mid",
      }),
      0,
    ];
  },
});
