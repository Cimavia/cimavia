import { useEffect } from "react";

/**
 * Remonte à l'écran qu'un formulaire porte une saisie NON ENREGISTRÉE — pour qu'une action
 * irréversible prise ailleurs sur la page ne parte pas sur les anciennes valeurs (#326).
 *
 * Le formulaire garde son état : le remonter tout entier ferait de l'écran le propriétaire de
 * chaque champ, pour un seul booléen dont il a besoin.
 *
 * La DISPARITION compte comme un retour au propre. Un formulaire démonté (cycle diffusé, passé en
 * auto-coaching) n'a plus de saisie à perdre : sans ce nettoyage, sa dernière valeur resterait
 * chez l'écran et fermerait l'action pour de bon, sans plus aucun champ où la lever.
 */
export function useReportDirty(isDirty: boolean, onDirtyChange: (isDirty: boolean) => void): void {
  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);
}
