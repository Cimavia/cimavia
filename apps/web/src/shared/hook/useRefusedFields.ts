import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";

type ReportRefused = (fieldId: string, refused: boolean) => void;

/**
 * Où un champ déclare que sa saisie est REFUSÉE (#566). Le constructeur le pose autour de son
 * formulaire ; sans lui, un champ refusé ne déclare rien et garde seulement son erreur.
 */
export const RefusedFieldsContext = createContext<ReportRefused | null>(null);

export type RefusedFields = {
  /** Vrai tant qu'au moins un champ montre une saisie qu'il a refusée. */
  hasRefused: boolean;
  /** À donner tel quel à `RefusedFieldsContext`. */
  report: ReportRefused;
};

/**
 * Le registre des saisies refusées d'un écran (#566).
 *
 * Un champ qui refuse une saisie la garde à l'écran et laisse le brouillon sur l'ancienne valeur :
 * enregistrer enverrait alors autre chose que ce que le coach voit. Le texte refusé reste LOCAL
 * au champ — le remonter ferait de l'écran le propriétaire de chaque cellule —, seul le fait du
 * refus remonte, pour fermer l'enregistrement et retenir la sortie.
 */
export function useRefusedFields(): RefusedFields {
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());

  // Stable : chaque champ s'inscrit dans un effet qui en dépend, et une fonction neuve à chaque
  // rendu le ferait se retirer puis se réinscrire en boucle.
  const report = useCallback((fieldId: string, isRefused: boolean) => {
    setRefused((current) => {
      if (current.has(fieldId) === isRefused) return current;
      const next = new Set(current);
      if (isRefused) next.add(fieldId);
      else next.delete(fieldId);
      return next;
    });
  }, []);

  return { hasRefused: refused.size > 0, report };
}

/**
 * Déclare la saisie refusée d'un champ au registre de l'écran, et l'en retire quand elle redevient
 * lisible, est vidée, ou que le champ DISPARAÎT (ligne supprimée, bloc retiré, structure changée) :
 * sans ce dernier cas, la ligne supprimée laisserait l'enregistrement fermé pour de bon, sans plus
 * aucun champ où le rouvrir.
 */
export function useReportRefused(refused: boolean): void {
  const report = useContext(RefusedFieldsContext);
  const fieldId = useId();

  useEffect(() => {
    if (!refused || report == null) return;
    report(fieldId, true);
    return () => report(fieldId, false);
  }, [refused, report, fieldId]);
}
