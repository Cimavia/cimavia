import {
  type CustomMetric,
  DosageLayout,
  dosageLayout,
  type ExerciseBlock,
  formatMetricValue,
  metricCellText,
  metricLabel,
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
  const { t } = useTranslation();

  const structure = structurePhrase(block.structure);
  const rest = restPhrase(block.structure);
  const shown = block.metrics.filter((metric) => !metric.collapsed);
  const collapsed = block.metrics.filter((metric) => metric.collapsed);
  const layout = dosageLayout(block);

  const heading = [
    block.label,
    structure == null ? null : t(structure.key, structure.params),
    ...collapsed.map((metric) => commonValue(block, metric, customMetrics, t)),
    rest == null ? null : t(rest.key, rest.params),
  ]
    .filter((part): part is string => part != null && part !== "")
    .join(", ");

  return (
    <View className="gap-2">
      {heading === "" ? null : <CmvText className="text-cmv-text-hi">{heading}</CmvText>}

      {layout === DosageLayout.PHRASE ? (
        <PhraseRows block={block} metrics={shown} customMetrics={customMetrics} t={t} />
      ) : null}
      {layout === DosageLayout.TABLE ? (
        <TableRows block={block} metrics={shown} customMetrics={customMetrics} t={t} />
      ) : null}
      {layout === DosageLayout.CARDS ? (
        <CardRows block={block} metrics={shown} customMetrics={customMetrics} t={t} />
      ) : null}
    </View>
  );
}

type RowsProps = {
  block: ExerciseBlock;
  metrics: ExerciseBlock["metrics"];
  customMetrics: readonly CustomMetric[];
  t: TFunction;
};

/** Une seule ligne : elle se DIT. Un tableau à une ligne met un en-tête sur une seule valeur. */
function PhraseRows({ block, metrics, customMetrics, t }: Readonly<RowsProps>) {
  const row = block.rows.at(0);
  if (row == null) return null;

  // Sans filtre : une colonne vide se DIT « — », comme dans l'aperçu du web. La phrase montre les
  // colonnes du bloc, et taire l'une d'elles ferait croire qu'elle n'existe pas.
  const phrase = metrics
    .map((metric) => metricCellText(row.values[metric.id] ?? null, metric, customMetrics, t))
    .join(" · ");

  return phrase === "" ? null : <CmvText className="text-cmv-text-mid">{phrase}</CmvText>;
}

/**
 * Deux à trois colonnes : les valeurs s'alignent, et l'œil compare une ligne à l'autre.
 *
 * Même habillage que le tableau du web — cadre, en-tête sur fond, filet entre les lignes,
 * pastille d'index. Les deux surfaces montrent la même donnée : les faire se ressembler évite au
 * coach de douter de ce que son athlète voit.
 */
function TableRows({ block, metrics, customMetrics, t }: Readonly<RowsProps>) {
  return (
    <View className="overflow-hidden rounded-lg border border-cmv-border">
      <View className="flex-row gap-2 border-cmv-border border-b bg-cmv-bg-1 px-2 py-2">
        <CmvText className="w-7 text-cmv-text-lo text-xs"> </CmvText>
        {metrics.map((metric) => (
          <CmvText key={metric.id} className="flex-1 text-cmv-text-lo text-xs">
            {metricLabel(metric, customMetrics, t).toUpperCase()}
          </CmvText>
        ))}
      </View>
      {block.rows.map((row, index) => (
        <View
          key={row.id}
          className={`flex-row items-center gap-2 px-2 py-2 ${
            index === block.rows.length - 1 ? "" : "border-cmv-border border-b"
          }`}
        >
          <View className="size-6 items-center justify-center rounded-md bg-cmv-surface">
            <CmvText className="text-cmv-text-mid text-xs">{index + 1}</CmvText>
          </View>
          {metrics.map((metric) => (
            <CmvText key={metric.id} className="flex-1 font-cmv-mono text-cmv-text-hi text-sm">
              {formatMetricValue(row.values[metric.id] ?? null, metric, customMetrics)}
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
function CardRows({ block, metrics, customMetrics, t }: Readonly<RowsProps>) {
  return (
    <View className="gap-2">
      {block.rows.map((row, index) => (
        <View key={row.id} className="gap-1 rounded-lg bg-cmv-bg-1 p-2">
          <CmvText className="text-cmv-text-lo text-xs">{index + 1}</CmvText>
          {metrics.map((metric) => (
            <View key={metric.id} className="flex-row justify-between gap-2">
              <CmvText className="text-cmv-text-mid text-xs">
                {metricLabel(metric, customMetrics, t)}
              </CmvText>
              <CmvText className="font-cmv-mono text-cmv-text-hi text-sm">
                {formatMetricValue(row.values[metric.id] ?? null, metric, customMetrics)}
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
): string | null {
  const value = block.rows.at(0)?.values[metric.id] ?? null;
  if (value == null) return null;
  return `${metricLabel(metric, customMetrics, t)} ${metricCellText(value, metric, customMetrics, t)}`;
}
