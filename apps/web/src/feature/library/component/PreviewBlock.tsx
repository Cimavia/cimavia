import {
  type CustomMetric,
  columnValues,
  type ExerciseBlock,
  restPhrase,
  structurePhrase,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import {
  formatMetricValue,
  metricCellText,
  metricLabel,
} from "@/feature/library/util/metric-label.util";
import { CMV_TABLE } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

// i18n-values exercise.dosage: series, emom, amrap, amrapWithTarget, circuit, restBetweenSets, restBetweenRounds

type PreviewBlockProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
};

/**
 * Un bloc vu par l'athlète. **Lecture seule**, et rien n'y ressemble à un réglage : les timers et
 * les cases à cocher DÉCOULENT de ces valeurs, le coach ne les paramètre pas.
 *
 * Deux rendus selon le nombre de lignes : une ligne se lit en phrase, plusieurs se lisent en
 * tableau. Forcer la phrase sur quatre lignes produirait une énumération illisible ; forcer le
 * tableau sur une ligne mettrait un en-tête au-dessus d'une seule valeur.
 */
export function PreviewBlock({ block, customMetrics }: Readonly<PreviewBlockProps>) {
  const { t } = useTranslation();

  const structure = structurePhrase(block.structure);
  const rest = restPhrase(block.structure);
  const expanded = block.metrics.filter((metric) => !metric.collapsed);
  const collapsed = block.metrics.filter((metric) => metric.collapsed);

  return (
    <section className="flex flex-col gap-cmv-xs">
      {block.label == null ? null : (
        <span className="text-cmv-caption text-cmv-text-mid">{block.label}</span>
      )}

      <p className="text-cmv-body text-cmv-text-hi">
        {structure == null ? null : t(structure.key, structure.params)}
        {collapsed.map((metric) => (
          <span key={metric.id} className="text-cmv-text-mid">
            {" · "}
            {metricLabel(metric, customMetrics, t)}{" "}
            {formatMetricValue(columnValues(block, metric.id)[0] ?? null, metric, customMetrics)}
          </span>
        ))}
        {rest == null ? null : (
          <span className="text-cmv-text-mid">{`, ${t(rest.key, rest.params)}`}</span>
        )}
      </p>

      {/* Une grille SANS ligne annonce ce qui viendra, plutôt que de montrer un tableau vide. */}
      {block.rows.length === 0 ? (
        <p className="text-cmv-caption text-cmv-text-lo">{t("library.builder.preview.noRow")}</p>
      ) : (
        <RowValues block={block} metrics={expanded} customMetrics={customMetrics} />
      )}
    </section>
  );
}

function RowValues({
  block,
  metrics,
  customMetrics,
}: Readonly<{
  block: ExerciseBlock;
  metrics: ExerciseBlock["metrics"];
  customMetrics: readonly CustomMetric[];
}>) {
  const { t } = useTranslation();

  const cells = (row: ExerciseBlock["rows"][number]) =>
    metrics.map((metric) => {
      const value = row.values[metric.id] ?? null;
      return metricCellText(value, metric, customMetrics, t);
    });

  // Une seule ligne : une phrase, pas un tableau à en-tête pour une valeur.
  if (block.rows.length === 1) {
    const only = block.rows[0];
    if (only == null) return null;
    return <p className="text-cmv-body text-cmv-text-mid">{cells(only).join(" · ")}</p>;
  }

  return (
    // La colonne d'aperçu fait 360 px : au-delà de trois colonnes le tableau la déborde, et sans
    // ce conteneur il débordait la CARTE elle-même. C'est au tableau de défiler, pas à l'aperçu.
    <div className={cn("overflow-x-auto", CMV_TABLE.frame)}>
      <table className={cn(CMV_TABLE.table, "text-cmv-caption")}>
        <thead>
          <tr className={cn(CMV_TABLE.head, CMV_TABLE.headBorder)}>
            <th className={`w-6 ${CMV_TABLE.headCell}`} scope="col">
              <span className="sr-only">{t("library.builder.grid.rowIndex")}</span>
            </th>
            {metrics.map((metric) => (
              <th key={metric.id} scope="col" className={CMV_TABLE.headCell}>
                <span className={CMV_TABLE.headLabel}>{metricLabel(metric, customMetrics, t)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-cmv-text-mid">
          {block.rows.map((row, index) => (
            <tr key={row.id} className={CMV_TABLE.row}>
              <td className={CMV_TABLE.cell}>
                <span className={CMV_TABLE.index}>{index + 1}</span>
              </td>
              {cells(row).map((cell, cellIndex) => (
                <td key={metrics[cellIndex]?.id ?? cellIndex} className={CMV_TABLE.cell}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
