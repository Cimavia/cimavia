import { ListItem } from "@tiptap/extension-list";

/**
 * L'élément de liste de la consigne : UN paragraphe, rien d'autre (#328).
 *
 * Celui de StarterKit accepte `paragraph block*` — une sous-liste, un second paragraphe. Le modèle
 * stocké (`listBlockSchema`) ne porte qu'un contenu inline par élément : la conversion jetait la
 * sous-liste et collait les paragraphes bout à bout, sans que le coach le sache.
 *
 * Deux verrous, parce qu'aucun ne suffit seul :
 * - le SCHÉMA ferme ce qui passe par le contenu : Tab au début d'un paragraphe sous une liste
 *   (`ListKeymap` l'y range en second paragraphe) et le collage, que ProseMirror remet à plat ;
 * - le RACCOURCI Tab est retiré : `sinkListItem` ne consulte pas le schéma avant d'imbriquer, il
 *   lèverait une erreur au lieu de refuser.
 *
 * Tab, que plus rien ne prend, sort du champ comme dans le reste du formulaire.
 */
export const ListItemExtension = ListItem.extend({
  content: "paragraph",

  addKeyboardShortcuts() {
    return Object.fromEntries(
      Object.entries(this.parent?.() ?? {}).filter(([key]) => key !== "Tab"),
    );
  },
});
