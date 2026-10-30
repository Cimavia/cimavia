import {
  type CustomMetric,
  formatMetricValue,
  type GridCell,
  type GridCellText,
  GridLayout,
  type GridReading,
  gridLinePhrases,
  metricLabel,
  metricUnitLabel,
  phraseId,
  unitRepeatsHeader,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvText } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

/**
 * Les valeurs d'un exercice de bloc (#722), comme `gridReading` les dispose : rien sans valeur, une
 * phrase quand toutes les lignes se ressemblent, un tableau tant que les colonnes tiennent, une
 * carte par ligne au-delà — jamais de défilement horizontal. Une cellule vide s'écrit « — ».
 */
export function GridValues({
  reading,
  customMetrics,
}: Readonly<{ reading: GridReading; customMetrics: readonly CustomMetric[] }>) {
  const text = usePhraseText();
  const describe = useDescribeCell(customMetrics);

  if (reading.layout === GridLayout.NONE) return null;

  if (reading.layout === GridLayout.LINE) {
    return (
      <CmvText className="text-cmv-text-mid text-sm">
        {text([
          ...(reading.each == null ? [] : [reading.each]),
          ...gridLinePhrases(reading.cells, describe),
        ])}
      </CmvText>
    );
  }

  if (reading.layout === GridLayout.TABLE) {
    const [first] = reading.rows;
    return (
      <View className="gap-1">
        <View className="flex-row gap-2">
          <View className="w-16" />
          {first?.cells.map((cell) => (
            <CmvText
              key={cell.metric.id}
              className="flex-1 text-cmv-text-lo text-xs"
              numberOfLines={1}
            >
              {describe(cell).label}
            </CmvText>
          ))}
        </View>
        {reading.rows.map((row) => (
          <View key={phraseId(row.label)} className="flex-row gap-2">
            <CmvText className="w-16 text-cmv-text-lo text-xs">{text([row.label])}</CmvText>
            {row.cells.map((cell) => (
              <CmvText
                key={cell.metric.id}
                className="flex-1 font-cmv-mono text-cmv-text-hi text-sm"
              >
                {cellText(describe(cell), cell)}
              </CmvText>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className="gap-2">
      {reading.rows.map((row) => (
        <View
          key={phraseId(row.label)}
          className="gap-1 rounded-lg border border-cmv-border bg-cmv-bg-1 px-3 py-2"
        >
          <CmvText className="text-cmv-text-lo text-xs">{text([row.label])}</CmvText>
          <CmvText className="text-cmv-text-mid text-sm">
            {text(gridLinePhrases(row.cells, describe))}
          </CmvText>
        </View>
      ))}
    </View>
  );
}

/** Ce qu'une cellule dit dans la langue de l'athlète : sa colonne, sa valeur, son unité. */
export function useDescribeCell(
  customMetrics: readonly CustomMetric[],
): (cell: GridCell) => GridCellText {
  const { t, i18n } = useTranslation();
  return (cell) => ({
    label: metricLabel(cell.metric, customMetrics, t),
    value: formatMetricValue(cell.value, cell.metric, customMetrics, i18n.language),
    unit: metricUnitLabel(cell.metric, customMetrics, t),
  });
}

/**
 * Une cellule du tableau : sa valeur et son unité, « — » quand elle est vide. L'unité se tait
 * quand l'en-tête la dit déjà (`unitRepeatsHeader`) : « Répétitions » puis « 8 », pas « 8
 * répétitions ».
 */
function cellText(described: GridCellText, cell: GridCell): string {
  if (cell.value == null) return "—";
  return described.unit == null || unitRepeatsHeader(cell.metric)
    ? described.value
    : `${described.value} ${described.unit}`;
}
