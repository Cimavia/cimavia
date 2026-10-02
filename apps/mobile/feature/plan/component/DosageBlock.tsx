import {
  type CustomMetric,
  DosageLayout,
  dosageLayout,
  type ExerciseBlock,
  formatMetricValue,
  metricCellText,
  metricLabel,
  type ReadingRow,
  readingRowLabel,
  readingRows,
  restPhrase,
  structurePhrase,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvText } from "@/shared/component";

// i18n-values exercise.dosage: series, emom, amrap, amrapWithTarget, circuit, restBetweenSets, restBetweenRounds
// i18n-values exercise.metric: MetricKey
// i18n-values exercise.unit: MetricUnit

type DosageBlockProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
};

/**
 * Le dosage d'un bloc, sur un écran étroit.
 *
 * La forme découle du contenu et de la largeur — phrase, mini-tableau ou une carte par ligne — et
 * ce choix vit dans `@cmv/shared` (`dosageLayout`), avec les chiffres qui le justifient. **Jamais
 * de défilement horizontal** : inutilisable une main sur la barre.
 */
export function DosageBlock({ block, customMetrics }: Readonly<DosageBlockProps>) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const structure = structurePhrase(block.structure);
  const rest = restPhrase(block.structure);
  const shown = block.metrics.filter((metric) => !metric.collapsed);
  const collapsed = block.metrics.filter((metric) => metric.collapsed);
  const layout = dosageLayout(block);
  const readings = readingRows(block);

  const heading = [
    block.label,
    structure == null ? null : t(structure.key, structure.params),
    ...collapsed.map((metric) => commonValue(block, metric, customMetrics, t, locale)),
    rest == null ? null : t(rest.key, rest.params),
  ]
    .filter((part): part is string => part != null && part !== "")
    .join(", ");

  return (
    <View className="gap-2">
      {heading === "" ? null : <CmvText className="text-cmv-text-hi">{heading}</CmvText>}

      {layout === DosageLayout.PHRASE ? (
        <PhraseRows
          readings={readings}
          metrics={shown}
          customMetrics={customMetrics}
          t={t}
          locale={locale}
        />
      ) : null}
      {layout === DosageLayout.TABLE ? (
        <TableRows
          readings={readings}
          metrics={shown}
          customMetrics={customMetrics}
          t={t}
          locale={locale}
        />
      ) : null}
      {layout === DosageLayout.CARDS ? (
        <CardRows
          readings={readings}
          metrics={shown}
          customMetrics={customMetrics}
          t={t}
          locale={locale}
        />
      ) : null}
    </View>
  );
}

type RowsProps = {
  /** Les lignes telles que l'athlète les joue : en Séries, les séries identiques regroupées (#520). */
  readings: readonly ReadingRow[];
  metrics: ExerciseBlock["metrics"];
  customMetrics: readonly CustomMetric[];
  t: TFunction;
  locale: string;
};

/** Une seule ligne : elle se DIT. Un tableau à une ligne met un en-tête sur une seule valeur. */
function PhraseRows({ readings, metrics, customMetrics, t, locale }: Readonly<RowsProps>) {
  const row = readings.at(0)?.row;
  if (row == null) return null;

  // Sans filtre : une colonne vide se DIT « — », comme dans l'aperçu du web. La phrase montre les
  // colonnes du bloc, et taire l'une d'elles ferait croire qu'elle n'existe pas.
  const phrase = metrics
    .map((metric) =>
      metricCellText(row.values[metric.id] ?? null, metric, customMetrics, t, locale),
    )
    .join(" · ");

  return phrase === "" ? null : <CmvText className="text-cmv-text-mid">{phrase}</CmvText>;
}

/**
 * Deux à trois colonnes : les valeurs s'alignent, et l'œil compare une ligne à l'autre.
 *
 * Même habillage que le tableau du web — cadre, en-tête sur fond, filet entre les lignes,
 * pastille d'index. Les deux surfaces montrent la même donnée : les faire se ressembler évite au
 * coach de douter de ce que son athlète voit.
 *
 * La colonne d'index s'élargit dès qu'une pastille porte une plage de séries (« 2–4 ») : toutes
 * les lignes la prennent, pour que les valeurs restent alignées sous leur en-tête.
 */
function TableRows({ readings, metrics, customMetrics, t, locale }: Readonly<RowsProps>) {
  const indexWidth = readings.some((reading) => reading.from !== reading.to) ? "w-12" : "w-7";
  return (
    <View className="overflow-hidden rounded-lg border border-cmv-border">
      <View className="flex-row gap-2 border-cmv-border border-b bg-cmv-bg-1 px-2 py-2">
        <CmvText className={`${indexWidth} text-cmv-text-lo text-xs`}> </CmvText>
        {metrics.map((metric) => (
          <CmvText key={metric.id} className="flex-1 text-cmv-text-lo text-xs">
            {metricLabel(metric, customMetrics, t).toUpperCase()}
          </CmvText>
        ))}
      </View>
      {readings.map((reading, index) => (
        <View
          key={reading.row.id}
          className={`flex-row items-center gap-2 px-2 py-2 ${
            index === readings.length - 1 ? "" : "border-cmv-border border-b"
          }`}
        >
          <View
            className={`h-6 ${indexWidth} items-center justify-center rounded-md bg-cmv-surface`}
          >
            <CmvText className="text-cmv-text-mid text-xs">{readingRowLabel(reading)}</CmvText>
          </View>
          {metrics.map((metric) => (
            <CmvText key={metric.id} className="flex-1 font-cmv-mono text-cmv-text-hi text-sm">
              {formatMetricValue(
                reading.row.values[metric.id] ?? null,
                metric,
                customMetrics,
                locale,
              )}
            </CmvText>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Quatre colonnes et plus : une carte par ligne. C'est la seule forme qui ne demande jamais de
 * défiler latéralement, et elle nomme chaque valeur au lieu de compter sur un en-tête lointain.
 */
function CardRows({ readings, metrics, customMetrics, t, locale }: Readonly<RowsProps>) {
  return (
    <View className="gap-2">
      {readings.map((reading) => (
        <View key={reading.row.id} className="gap-1 rounded-lg bg-cmv-bg-1 p-2">
          <CmvText className="text-cmv-text-lo text-xs">{readingRowLabel(reading)}</CmvText>
          {metrics.map((metric) => (
            <View key={metric.id} className="flex-row justify-between gap-2">
              <CmvText className="text-cmv-text-mid text-xs">
                {metricLabel(metric, customMetrics, t)}
              </CmvText>
              <CmvText className="font-cmv-mono text-cmv-text-hi text-sm">
                {formatMetricValue(
                  reading.row.values[metric.id] ?? null,
                  metric,
                  customMetrics,
                  locale,
                )}
              </CmvText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** La valeur commune d'une colonne repliée — « repos 2'30 », dite une fois pour toutes. */
function commonValue(
  block: ExerciseBlock,
  metric: ExerciseBlock["metrics"][number],
  customMetrics: readonly CustomMetric[],
  t: TFunction,
  locale: string,
): string | null {
  const value = block.rows.at(0)?.values[metric.id] ?? null;
  if (value == null) return null;
  return `${metricLabel(metric, customMetrics, t)} ${metricCellText(value, metric, customMetrics, t, locale)}`;
}
