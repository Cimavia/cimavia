import {
  type CustomMetric,
  columnValues,
  type ExerciseBlock,
  formatTrainingDuration,
  type MetricValue,
  MetricValueType,
  metricValueTypeOf,
  restPhrase,
  structurePhrase,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { metricLabel, metricUnitLabel } from "@/feature/library/util/metric-label.util";

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
            {formatValue(columnValues(block, metric.id)[0] ?? null, metric, customMetrics)}
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

/** `—` et jamais `0` : une valeur absente est une absence, pas un zéro (règle dure n°5). */
function formatValue(
  value: MetricValue,
  metric: ExerciseBlock["metrics"][number],
  customMetrics: readonly CustomMetric[],
): string {
  if (value == null) return "—";
  if (metricValueTypeOf(metric, customMetrics) === MetricValueType.DURATION) {
    return typeof value === "number" ? (formatTrainingDuration(value) ?? "—") : String(value);
  }
  return String(value);
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
      const unit = metricUnitLabel(metric, customMetrics, t);
      const shown = formatValue(row.values[metric.id] ?? null, metric, customMetrics);
      return `${shown}${unit == null ? "" : ` ${unit}`}`;
    });

  // Une seule ligne : une phrase, pas un tableau à en-tête pour une valeur.
  if (block.rows.length === 1) {
    const only = block.rows[0];
    if (only == null) return null;
    return <p className="text-cmv-body text-cmv-text-mid">{cells(only).join(" · ")}</p>;
  }

  return (
    <table className="w-full text-left text-cmv-caption">
      <thead>
        <tr className="text-cmv-text-lo">
          <th className="w-6" scope="col">
            <span className="sr-only">{t("library.builder.grid.rowIndex")}</span>
          </th>
          {metrics.map((metric) => (
            <th key={metric.id} scope="col" className="pb-cmv-xs font-normal">
              {metricLabel(metric, customMetrics, t)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="text-cmv-text-mid">
        {block.rows.map((row, index) => (
          <tr key={row.id}>
            <td className="text-cmv-text-lo">{index + 1}</td>
            {cells(row).map((cell, cellIndex) => (
              <td key={metrics[cellIndex]?.id ?? cellIndex} className="pr-cmv-sm">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
