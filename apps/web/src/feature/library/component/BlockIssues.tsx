import {
  type CustomMetric,
  type ExerciseBlock,
  emptyRowIndexes,
  metricLabel,
  validateBlockValues,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";

type BlockIssuesProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
};

/**
 * Ce qui cloche dans un bloc, dit sans bloquer.
 *
 * Aucun de ces cas n'empêche d'enregistrer, et c'est délibéré : le coach construit rarement un
 * exercice d'une traite, et refuser l'enregistrement d'une grille à moitié remplie lui ferait
 * perdre ce qu'il vient d'écrire. On signale, il tranche.
 */
export function BlockIssues({ block, customMetrics }: Readonly<BlockIssuesProps>) {
  const { t } = useTranslation();

  const empties = emptyRowIndexes(block);
  const invalid = validateBlockValues(block, customMetrics);
  if (empties.length === 0 && invalid.length === 0) return null;

  // Une colonne par message plutôt qu'une ligne par cellule fautive : trois erreurs dans la même
  // colonne disent la même chose, et les répéter noierait le reste.
  const byMetric = new Map<string, number>();
  for (const issue of invalid) {
    byMetric.set(issue.metricId, (byMetric.get(issue.metricId) ?? 0) + 1);
  }

  return (
    <ul className="flex flex-col gap-cmv-xs">
      {empties.map((index) => (
        <li key={`empty-${index}`} className="text-cmv-caption text-cmv-warning-on">
          {t("library.builder.issue.emptyRow", { index: index + 1 })}
        </li>
      ))}
      {[...byMetric.keys()].map((metricId) => {
        const metric = block.metrics.find((current) => current.id === metricId);
        return (
          <li key={metricId} className="text-cmv-caption text-cmv-warning-on">
            {metric == null
              ? t("library.builder.issue.orphanValue")
              : t("library.builder.issue.badValue", {
                  column: metricLabel(metric, customMetrics, t),
                })}
          </li>
        );
      })}
    </ul>
  );
}
