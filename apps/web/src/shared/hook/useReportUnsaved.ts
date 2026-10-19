import { useCallback, useEffect, useRef } from "react";
import type { SaveBeforeLeaving } from "@/shared/hook/useLeaveGuard";

/**
 * Remonte à l'écran qu'un formulaire porte une saisie NON ENREGISTRÉE, et de quoi l'enregistrer —
 * `null` sans rien en attente. L'écran en tire deux choses : une action irréversible prise ailleurs
 * sur la page ne part pas sur les anciennes valeurs (#326), et « Enregistrer » du dialogue de
 * sortie enregistre CE formulaire avec les autres (#682).
 *
 * Le formulaire garde son état : le remonter tout entier ferait de l'écran le propriétaire de
 * chaque champ, pour une saisie dont il n'a besoin que de savoir si elle attend, et de l'envoyer.
 *
 * L'enregistrement remonté est STABLE : il lit le dernier `save` par ref. Neuf à chaque rendu, il
 * relancerait l'effet, donc un rendu de l'écran, donc un rendu du formulaire — sans fin.
 *
 * La DISPARITION compte comme un retour au propre. Un formulaire démonté (cycle diffusé, passé en
 * auto-coaching) n'a plus de saisie à perdre : sans ce nettoyage, sa dernière valeur resterait
 * chez l'écran et fermerait l'action pour de bon, sans plus aucun champ où la lever.
 */
export function useReportUnsaved(
  isDirty: boolean,
  save: SaveBeforeLeaving,
  onUnsavedChange: (save: SaveBeforeLeaving | null) => void,
): void {
  const latestSave = useRef(save);
  latestSave.current = save;
  const stableSave = useCallback(() => latestSave.current(), []);

  useEffect(() => {
    onUnsavedChange(isDirty ? stableSave : null);
    return () => onUnsavedChange(null);
  }, [isDirty, onUnsavedChange, stableSave]);
}
