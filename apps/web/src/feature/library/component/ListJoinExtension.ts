import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";

const LIST_NODES = new Set(["bulletList", "orderedList"]);

/** Le curseur est-il au début d'un bloc de texte qui suit directement une liste ? */
function startsRightAfterList($from: ResolvedPos): boolean {
  if ($from.depth !== 1 || $from.parentOffset !== 0 || !$from.parent.isTextblock) return false;
  const before = $from.node(0).maybeChild($from.index(0) - 1);
  return before != null && LIST_NODES.has(before.type.name);
}

/**
 * Le curseur est-il en fin du DERNIER élément d'une liste suivie d'un bloc de texte ?
 * Profondeur 3 : document › liste › élément › paragraphe — l'élément n'a qu'un paragraphe.
 */
function endsRightBeforeBlock($from: ResolvedPos): boolean {
  if ($from.depth !== 3 || $from.parentOffset !== $from.parent.content.size) return false;
  const list = $from.node(1);
  if (!LIST_NODES.has(list.type.name) || $from.index(1) !== list.childCount - 1) return false;
  return $from.node(0).maybeChild($from.index(0) + 1)?.isTextblock === true;
}

/**
 * Effacer à la jonction d'une liste et du bloc qui la suit JOINT leurs textes (#328).
 *
 * L'élément de liste n'a plus qu'un paragraphe (`ListItemExtension`) : `ListKeymap`, qui rangeait
 * le bloc dans l'élément en second paragraphe, ne le peut plus, et ProseMirror l'enveloppait dans
 * un NOUVEL élément — que Backspace ressortait aussitôt de la liste, sans fin. On joint donc le
 * texte, comme partout ailleurs entre deux blocs.
 *
 * Priorité 102 : passer avant `ListKeymap` (100) et avant le Delete des listes ramifiées (101).
 */
export const ListJoinExtension = Extension.create({
  name: "listJoin",
  priority: 102,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        return (
          selection.empty &&
          startsRightAfterList(selection.$from) &&
          editor.commands.joinTextblockBackward()
        );
      },
      Delete: ({ editor }) => {
        const { selection } = editor.state;
        return (
          selection.empty &&
          endsRightBeforeBlock(selection.$from) &&
          editor.commands.joinTextblockForward()
        );
      },
    };
  },
});
